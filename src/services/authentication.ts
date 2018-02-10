import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
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
		public http: Http,
		public configSvc: ConfigurationService
	){
	}
			
	/** Checks to see the account is has a specific role of the app */
	isInAppRole(objectName?: string, role?: string, privileges?: Array<AppModels.Privilege>) {
		objectName = AppUtility.isNotEmpty(objectName) ? objectName : "";
		role = AppUtility.isNotEmpty(role) ? role : "Viewer";
		privileges = privileges || this.configSvc.getAccount().privileges;
		let privilege = privileges
			? new List(privileges).FirstOrDefault(p => p.ServiceName == "books" && p.ObjectName == objectName)
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
		return this.isSystemAdministrator(account) || this.isServiceAdministrator(account) || this.isInAppRole(objectName || "", "Administrator", account.privileges);
	}

	/** Checks to see the account is moderator of the service/object or not */
	isModerator(objectName?: string, account?: AppData.Account) {
		return this.isAdministrator(objectName, account) || this.isInAppRole(objectName || "", "Moderator", account ? account.privileges : undefined);
	}

	/** Registers a captcha with REST API */
	async registerCaptchaAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/captcha"
				+ "?register=" + AppData.Configuration.session.id;
			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			AppData.Configuration.session.captcha = {
				code: data.Code,
				uri: data.Uri
			};
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while registering a session captcha", e.json(), onError);
		}
	}

	/** Registers an account with APIs */
	async registerAccountAsync(info: any, captcha: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			var body = AppUtility.clone(info);
			delete body.ConfirmEmail;
			delete body.ConfirmPassword;

			body.ReferID = AppData.Configuration.app.refer.id;
			body.ReferSection = AppData.Configuration.app.refer.section;
			body.Email = AppCrypto.rsaEncrypt(body.Email);
			body.Password = AppCrypto.rsaEncrypt(body.Password);

			let path = "users/account"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name)
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");

			let response = await AppAPI.PostAsync(path, body, AppAPI.getCaptchaHeaders(captcha));
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while registering new account", e.json(), onError);
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
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while signing-in", e.json(), onError);
		}
	}

	/** Signs an account out with REST API */
	async signOutAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.DeleteAsync("users/session");
			let data = response.json();
			await this.configSvc.updateSessionAsync(data);
			AppEvents.broadcast("AccountIsUpdated");

			await this.configSvc.registerSessionAsync(() => {
				console.info("[Authentication]: Sign-out successful", AppUtility.isDebug() ? AppData.Configuration.session : "");
				this.configSvc.patchSession();
				onNext != undefined && onNext(AppData.Configuration.session);
			}, onError);
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while signing-out", e.json(), onError);
		}
	}

	// privileges
	async getPrivilegesAsync(id: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/" + id
				+ "?related-service=books"
				+ "&languague=vi-VN"
			let response = await AppAPI.GetAsync(path);
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while fetching privileges of an user", e.json(), onError);
		}
	}

	async setPrivilegesAsync(id: string, privileges: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/" + id
				+ "?related-service=books"
				+ "&languague=vi-VN"
			let response = await AppAPI.PutAsync(path, privileges);
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while updating privileges of an user", e.json(), onError);
		}
	}

	// invitation
	async sendInvitationAsync(name: string, email: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/invite"
				+ "?related-service=books"
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name)
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");

			let body = {
				Name: name,
				Email: AppCrypto.rsaEncrypt(email),
				Campaign: "Books-Email-Invitation"
			};

			let response = await AppAPI.PostAsync(path, body);
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while sending an invitation", e.json(), onError);
		}
	}

	/** Send the request to reset password */
	async resetPasswordAsync(email: string, captcha: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/reset"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name)
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");

			let body = {
				Email: AppCrypto.rsaEncrypt(email)
			};
			
			let response = await AppAPI.PutAsync(path, body, AppAPI.getCaptchaHeaders(captcha));
			console.info("[Authentication]: Send the request to reset password successful");
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while sending a request to reset password", e.json(), onError);
		}
	}

	// update password
	async updatePasswordAsync(oldPassword: string, password: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/password"
				+ "?related-service=books"
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);

			let body = {
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Password: AppCrypto.rsaEncrypt(password)
			};

			let response = await AppAPI.PutAsync(path, body);
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while updating password", e.json(), onError);
		}
	}

	// update email
	async updateEmailAsync(oldPassword: string, email: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/email"
				+ "?related-service=books"
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);

			let body = {
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Email: AppCrypto.rsaEncrypt(email)
			};
			 
			let response = await AppAPI.PutAsync(path, body);
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while updating email", e.json(), onError);
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
				+ "&related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);

			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			AppData.Configuration.session.account = this.configSvc.getAccount(true);
			await this.configSvc.updateSessionAsync(data, () => {
				AppData.Configuration.session.account.id = AppData.Configuration.session.jwt.uid;
				this.configSvc.saveSessionAsync();
				console.info("Activated...", AppUtility.isDebug() ? AppData.Configuration.session : "");
			});
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while activating (" + mode + ")", e.json(), onError);
		}
	}

	async prepareOTPAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/otp"
				+ "?related-service=books"
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);

			let response = await AppAPI.GetAsync(path);
			onNext != undefined && onNext(response.json());
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while preparing OTP", e.json(), onError);
		}
	}

	async updateOTPAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/otp"
				+ "?related-service=books"
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);

			let response = await AppAPI.PutAsync(path, info);
			let data = response.json();
			this.configSvc.updateAccount(data);
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while updating OTP", e.json(), onError);
		}
	}

	async deleteOTPAsync(info: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/otp"
				+ "?info=" + info
				+ "&related-service=books"
				+ "&language=" + AppData.Configuration.session.account.profile.Language
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);
			let response = await AppAPI.DeleteAsync(path);
			let data = response.json();
			this.configSvc.updateAccount(data);
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while deleting OTP", e.json(), onError);
		}
	}

	async validateOTPAsync(id: string, otp: string, info: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/session"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);

			let body = {
				ID: AppCrypto.rsaEncrypt(id),
				OTP: AppCrypto.rsaEncrypt(otp),
				Info: AppCrypto.rsaEncrypt(info)
			};

			let response = await AppAPI.PutAsync(path, body);
			await this.updateSessionAsync(response.json(), onNext);
		}
		catch (e) {
			AppUtility.showError("[Authentication]: Error occurred while validating OTP", e.json(), onError);
		}
	}

	/** Update session when perform success */
	async updateSessionAsync(data: any, onCompleted?: (data?: any) => void) {
		await this.configSvc.updateSessionAsync(data);
		if (AppData.Configuration.session.account == null) {
			AppData.Configuration.session.account = this.configSvc.getAccount(true);
		}
		AppData.Configuration.session.account.id = AppData.Configuration.session.jwt.uid;

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