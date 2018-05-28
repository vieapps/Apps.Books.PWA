import { Injectable } from "@angular/core";
import { List } from "linqts";

import { AppUtility } from "../components/utility";
import { AppCrypto } from "../components/crypto";
import { AppAPI } from "../components/api";
import { AppEvents } from "../components/events";
import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

import { ConfigurationService } from "./configuration";

@Injectable()
export class AuthenticationService {

	constructor(
		public configSvc: ConfigurationService
	){
	}
			
	/** Checks to see the account is has a specific role of the app */
	isInAppRole(objectName?: string, role?: string, privileges?: Array<AppModels.Privilege>, serviceName?: string) {
		serviceName = AppUtility.isNotEmpty(serviceName) ? serviceName : AppData.Configuration.app.service;
		objectName = AppUtility.isNotEmpty(objectName) ? objectName : "";
		role = AppUtility.isNotEmpty(role) ? role : "Viewer";
		privileges = privileges || this.configSvc.getAccount().privileges;
		let privilege = privileges
			? new List(privileges).FirstOrDefault(p => p.ServiceName == serviceName && p.ObjectName == objectName)
			: undefined;
		return privilege != undefined && privilege.Role == role;
	}

	/** Checks to see the account is system administrator or not */
	isSystemAdministrator(account?: AppData.Account) {
		account = account || this.configSvc.getAccount();
		return account && AppUtility.isNotEmpty(account.id) && account.roles && AppUtility.isArray(account.roles)
			&& new List(account.roles).FirstOrDefault(r => r == "SystemAdministrator") != undefined;
	}

	/** Checks to see the account is service administrator or not */
	isServiceAdministrator(account?: AppData.Account) {
		account = account || this.configSvc.getAccount();
		return this.isInAppRole("", "Administrator", account.privileges) || this.isSystemAdministrator(account);
	}

	/** Checks to see the account is service moderator or not */
	isServiceModerator(account?: AppData.Account) {
		account = account || this.configSvc.getAccount();
		return this.isInAppRole("", "Moderator", account.privileges) || this.isServiceAdministrator(account);
	}

	/** Checks to see the account is administrator (means system administrator or service administrator) or not */
	isAdministrator(objectName?: string, account?: AppData.Account) {
		account = account || this.configSvc.getAccount();
		return this.isSystemAdministrator(account) || this.isServiceAdministrator(account) || this.isInAppRole(objectName, "Administrator", account.privileges);
	}

	/** Checks to see the account is moderator of the service/object or not */
	isModerator(objectName?: string, account?: AppData.Account) {
		return this.isAdministrator(objectName, account) || this.isInAppRole(objectName || "", "Moderator", account ? account.privileges : undefined);
	}

	/** Registers an account with APIs */
	async registerAccountAsync(info: any, captcha: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let body = AppUtility.clone(info);
			delete body.ConfirmEmail;
			delete body.ConfirmPassword;

			body.ReferID = AppData.Configuration.app.refer.id;
			body.ReferSection = AppData.Configuration.app.refer.section;
			body.Email = AppCrypto.rsaEncrypt(body.Email);
			body.Password = AppCrypto.rsaEncrypt(body.Password);

			let path = "users/account"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=vi-VN"
				+ "&host=" + AppUtility.getHost()
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");

			let response = await AppAPI.PostAsync(path, body, AppAPI.getCaptchaHeaders(captcha));
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while registering new account", error, onError);
		}
	}

	/** Signs an account in with APIs */
	async signInAsync(email: string, password: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let body = {
				Email: AppCrypto.rsaEncrypt(email),
				Password: AppCrypto.rsaEncrypt(password)
			};
			let response = await AppAPI.PostAsync("users/session", body);
			let data = response.json();
			if (!data.Require2FA) {
				await this.updateSessionAsync(data, onNext);
			}
			else {
				onNext != undefined && onNext(data);
			}
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while signing-in", error, onError);
		}
	}

	/** Signs an account out with REST API */
	async signOutAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.DeleteAsync("users/session");
			await this.configSvc.updateSessionAsync(response.json());
			AppEvents.broadcast("AccountIsUpdated", { Type: "SignOut" });

			await this.configSvc.registerSessionAsync(() => {
				console.info("[Authentication]: Sign-out successful", AppUtility.isDebug() ? AppData.Configuration.session : "");
				this.configSvc.patchSession();
				onNext != undefined && onNext(AppData.Configuration.session);
			}, onError);
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while signing-out", error, onError);
		}
	}

	// privileges
	async getPrivilegesAsync(id: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/" + id
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&languague=vi-VN"
			let response = await AppAPI.GetAsync(path);
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while fetching privileges of an user", error, onError);
		}
	}

	async setPrivilegesAsync(id: string, privileges: Array<AppModels.Privilege>, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "Users/Account/" + id
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&languague=vi-VN"
			let body = {
				Privileges: AppCrypto.rsaEncrypt(JSON.stringify(privileges))
			};
			let response = await AppAPI.PutAsync(path, body);
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while updating privileges of an user", error, onError);
		}
	}

	// invitation
	async sendInvitationAsync(name: string, email: string, privileges?: Array<AppModels.Privilege>, relatedInfo?: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/invite"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + AppUtility.getHost()
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");

			let body = {
				Name: name,
				Email: AppCrypto.rsaEncrypt(email),
				Campaign: "Individual-App-Email-Invitation"
			};
			
			if (privileges) {
				body["Privileges"] = AppCrypto.rsaEncrypt(JSON.stringify(privileges));
			}
			
			if (relatedInfo) {
				body["RelatedInfo"] = AppCrypto.rsaEncrypt(JSON.stringify(relatedInfo));
			}

			let response = await AppAPI.PostAsync(path, body);
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while sending an invitation", error, onError);
		}
	}

	/** Send the request to reset password */
	async resetPasswordAsync(email: string, captcha: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/reset"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=vi-VN"
				+ "&host=" + AppUtility.getHost()
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");

			let body = {
				Email: AppCrypto.rsaEncrypt(email)
			};
			
			let response = await AppAPI.PutAsync(path, body, AppAPI.getCaptchaHeaders(captcha));
			console.info("[Authentication]: Send the request to reset password successful");
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while sending a request to reset password", error, onError);
		}
	}

	// update password
	async updatePasswordAsync(oldPassword: string, password: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/password"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + AppUtility.getHost();

			let body = {
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Password: AppCrypto.rsaEncrypt(password)
			};

			let response = await AppAPI.PutAsync(path, body);
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while updating password", error, onError);
		}
	}

	// update email
	async updateEmailAsync(oldPassword: string, email: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/email"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + AppUtility.getHost();

			let body = {
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Email: AppCrypto.rsaEncrypt(email)
			};
			 
			let response = await AppAPI.PutAsync(path, body);
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while updating email", error, onError);
		}
	}

	// activate (account, password, email)
	async activateAsync(mode: string, code: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			if (AppData.Configuration.app.mode == "") {
				this.configSvc.prepare();
			}
			let path = "users/activate"
				+ "?mode=" + mode
				+ "&code=" + code
				+ "&related-service=" + AppData.Configuration.app.service
				+ "&language=vi-VN"
				+ "&host=" + AppUtility.getHost();

			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			AppData.Configuration.session.account = this.configSvc.getAccount(true);
			await this.configSvc.updateSessionAsync(data, () => {
				AppData.Configuration.session.account.id = AppData.Configuration.session.token.uid;
				this.configSvc.saveSessionAsync();
				console.info("Activated...", AppUtility.isDebug() ? AppData.Configuration.session : "");
			});
			onNext != undefined && onNext(data);
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while activating (" + mode + ")", error, onError);
		}
	}

	async prepareOTPAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "Users/OTP"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + AppUtility.getHost();

			let response = await AppAPI.GetAsync(path);
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while preparing OTP", error, onError);
		}
	}

	async updateOTPAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "Users/OTP"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + AppUtility.getHost();

			let response = await AppAPI.PutAsync(path, info);
			let data = response.json();
			this.configSvc.updateAccount(data);
			onNext != undefined && onNext(data);
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while updating OTP", error, onError);
		}
	}

	async deleteOTPAsync(info: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "Users/OTP"
				+ "?info=" + info
				+ "&related-service=" + AppData.Configuration.app.service
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + AppUtility.getHost();
			let response = await AppAPI.DeleteAsync(path);
			let data = response.json();
			this.configSvc.updateAccount(data);
			onNext != undefined && onNext(data);
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while deleting OTP", error, onError);
		}
	}

	async validateOTPAsync(id: string, otp: string, info: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "Users/Session"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=vi-VN"
				+ "&host=" + AppUtility.getHost();

			let body = {
				ID: AppCrypto.rsaEncrypt(id),
				OTP: AppCrypto.rsaEncrypt(otp),
				Info: AppCrypto.rsaEncrypt(info)
			};

			let response = await AppAPI.PutAsync(path, body);
			await this.updateSessionAsync(response.json(), onNext);
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while validating OTP", error, onError);
		}
	}

	/** Registers a captcha with REST API */
	async registerCaptchaAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.GetAsync("Users/Captcha?register=" + AppData.Configuration.session.id);
			let data = response.json();
			AppData.Configuration.session.captcha = {
				code: data.Code,
				uri: data.Uri
			};
			onNext != undefined && onNext(data);
		}
		catch (error) {
			AppUtility.showError("[Authentication]: Error occurred while registering a session captcha", error, onError);
		}
	}

	/** Update session when perform success */
	async updateSessionAsync(data: any, onCompleted?: (data?: any) => void) {
		await this.configSvc.updateSessionAsync(data);
		if (!AppData.Configuration.session.account) {
			AppData.Configuration.session.account = this.configSvc.getAccount(true);
		}
		AppData.Configuration.session.account.id = AppData.Configuration.session.token.uid;

		console.info("[Authentication]: Authenticated session is registered", AppUtility.isDebug() ? AppData.Configuration.session : "");
		AppEvents.broadcast("SessionIsRegistered");

		this.configSvc.patchSession(() => {
			this.configSvc.patchAccount(() => {
				this.configSvc.getProfile();
				onCompleted != undefined && onCompleted(data);
			});
		}, 123);
	}

}