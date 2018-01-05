import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { List } from "linqts";
import "rxjs/add/operator/toPromise";
import "rxjs/add/operator/map";

declare var FB: any;

import { AppUtility } from "../components/utility";
import { AppCrypto } from "../components/crypto";
import { AppAPI } from "../components/api";
import { AppRTU } from "../components/rtu";
import { AppEvents } from "../components/events";
import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

import { ConfigurationService } from "./configuration";

@Injectable()
export class AuthenticationService {

	constructor(public http: Http, public configSvc: ConfigurationService) {
		AppAPI.setHttp(this.http);
		AppRTU.register("Users", (message: any) => this.processRTU(message));
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
		return this.isInAppRole("", "Administrator", account.privileges);
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
			if (data.Status == "OK") {
				AppData.Configuration.session.captcha = {
					code: data.Data.Code,
					uri: data.Data.Uri
				};
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while registering a captcha");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while registering a session captcha", e);
			onError != undefined && onError(e);
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
			body.Captcha = AppCrypto.aesEncrypt(JSON.stringify({ Registered: AppData.Configuration.session.captcha.code, Input: captcha }));

			let path = "users/account"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name)
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");

			let response = await AppAPI.PostAsync(path, body);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while registering an account");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while registering new account", e);
			onError != undefined && onError(e);
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
			if (data.Status == "OK") {
				if (!data.Data.Require2FA) {
					await this.updateSessionAsync(data.Data);
				}
				onNext != undefined && onNext(data.Data);
			}
			else {
				console.error("[Authentication]: Error occurred while signing-in");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while signing-in", e);
			onError != undefined && onError(e);
		}
	}

	/** Signs an account out with REST API */
	async signOutAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.DeleteAsync("users/session");
			let data = response.json();
			if (data.Status == "OK") {
				await this.configSvc.updateSessionAsync(data.Data);
				AppEvents.broadcast("AccountIsUpdated");

				await this.configSvc.registerSessionAsync(() => {
					console.info("[Authentication]: Sign-out successful", AppUtility.isDebug() ? AppData.Configuration.session : "");
					this.patchSession();
					onNext != undefined && onNext(AppData.Configuration.session);
				}, onError);
			}
			else {
				console.error("[Authentication]: Error occurred while signing-out");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while signing-out", e);
			onError != undefined && onError(e);
		}
	}

	/** Update session when perform success */
	async updateSessionAsync(data: any) {
		await this.configSvc.updateSessionAsync(data);
		if (AppData.Configuration.session.account == null) {
			AppData.Configuration.session.account = this.configSvc.getAccount(true);
		}
		AppData.Configuration.session.account.id = AppData.Configuration.session.jwt.uid;

		console.info("[Authentication]: Authenticated session is registered", AppUtility.isDebug() ? AppData.Configuration.session : "");
		AppEvents.broadcast("SessionIsRegistered");

		this.patchSession(() => {
			this.configSvc.patchAccount(() => {
				this.getProfile();
				this.configSvc.getBookmarks();
			});
		}, 123);
	}

	patchSession(onNext?: () => void, defer?: number): void {
		AppUtility.setTimeout(() => {
			AppRTU.send(
				{
					ServiceName: "users",
					ObjectName: "session",
					Verb: "PATCH",
					Extra: {
						"x-session": AppData.Configuration.session.id
					}
				},
				() => {
					onNext != undefined && onNext();
				},
				() => {
					onNext != undefined && onNext();
				}
			);
		}, defer || 456);
	}
	
	/** Get profile information */
	getProfile(id?: string, onCompleted?: (data?: any) => void) {
		var request = {
			ServiceName: "users",
			ObjectName: "profile",
			Verb: "GET",
			Query: {
				"related-service": "books",
				"language": "vi-VN",
				"host": (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name)
			}
		};
		if (AppUtility.isNotEmpty(id)) {
			request.Query["object-identity"] = id;
		}

		AppRTU.send(request,
			() => {
				onCompleted != undefined && onCompleted();
			},
			(observable) => {
				observable.map(response => response.json()).subscribe(
					(data: any) => {
						if (data.Status == "OK") {
							this.updateProfileAsync(data.Data, onCompleted);
						}
						else {
							console.error("[Authentication]: Error occurred while fetching account profile");
							AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
						}
					},
					(error: any) => {
						console.error("[Authentication]: Error occurred while fetching a profile", error);
					}
				);
			}
		);
	}

	/** Get profile information of an account */
	async getProfileAsync(dontUseRTU?: boolean, id?: string, onCompleted?: (data?: any) => void) {
		let useRTU = AppUtility.isFalse(dontUseRTU) && id == undefined && AppRTU.isReady();
		if (useRTU) {
			this.getProfile(id, onCompleted);
			AppUtility.setTimeout(() => {
				AppData.Configuration.session.account != null
				&& (AppData.Configuration.session.account.profile == null || !(AppData.Configuration.session.account.profile instanceof AppModels.Account))
				&& this.getProfileAsync(true, id, onCompleted);
			}, 1234);
		}
		else {
			try {
				let path = "users/profile" + (AppUtility.isNotEmpty(id) ? "/" + id : "")
					+ "?related-service=books"
					+ "&language=vi-VN";
				let response = await AppAPI.GetAsync(path);
				let data = response.json();
				if (data.Status == "OK") {
					this.updateProfileAsync(data.Data, onCompleted);
				}
				else {
					console.error("[Authentication]: Error occurred while fetching account profile");
					AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				}
			}
			catch (e) {
				console.error("[Authentication]: Error occurred while fetching account profile", e);
			}
		}
	}

	/** Update the information of an account profile */
	async updateProfileAsync(profile: any, onCompleted?: (data?: any) => void) {
		// update profile into collection of accounts
		AppModels.Account.update(profile);

		// update profile of current user
		if (AppData.Configuration.session.jwt != null && AppData.Configuration.session.jwt.uid == profile.ID) {
			AppData.Configuration.session.account.id = profile.ID;
			AppData.Configuration.session.account.profile = AppData.Accounts.getValue(profile.ID);
			await this.storeProfileAsync(() => {
				AppUtility.isDebug() && console.info("[Authentication]: Account profile is updated", AppData.Configuration.session.account);
				onCompleted != undefined && onCompleted(AppData.Configuration.session.account);
			});
			AppData.Configuration.facebook.token != null && AppData.Configuration.facebook.id != null && this.getFacebookProfile();
		}

		// callback when the profile is not profile of current user account
		else {
			onCompleted != undefined && onCompleted(profile);
		}
	}

	/** Store the information of current account profile into storage */
	async storeProfileAsync(onCompleted?: (data?: any) => void) {
		await this.configSvc.saveSessionAsync();
		AppEvents.broadcast("AccountIsUpdated");
		onCompleted != undefined && onCompleted(AppData.Configuration.session);
	}

	/** Perform save profile information (with REST API) */
	async saveProfileAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/profile"
				+ "?related-service=books"
				+ "&language=vi-VN";
			let response = await AppAPI.PutAsync(path, info);
			let data = response.json();
			if (data.Status == "OK") {
				await this.updateProfileAsync(data.Data, onNext);
			}
			else {
				console.error("[Authentication]: Error occurred while updating account profile");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while updating account profile", e);
			onError != undefined && onError(e);
		}
	}

	/** Watch the connection of Facebook */
	watchFacebookConnect() {
		FB.Event.subscribe("auth.authResponseChange",
			(response: any) => {
				if (response.status === "connected") {
					AppData.Configuration.facebook.token = response.authResponse.accessToken;
					AppData.Configuration.facebook.id = response.authResponse.userID;
					console.info("[Authentication]: Facebook is connected", !AppUtility.isDebug() ? "" : AppData.Configuration.facebook);

					if (AppData.Configuration.session.account.facebook != null) {
						this.getFacebookProfile();
					}
				}
				else {
					AppData.Configuration.facebook.token = null;
				}
			}
		);
	}

	/** Get the information of Facebook profile */
	getFacebookProfile() {
		FB.api("/" + AppData.Configuration.facebook.version + "/me?fields=id,name,picture&access_token=" + AppData.Configuration.facebook.token,
			(response: any) => {
				AppData.Configuration.session.account.facebook = {
					id: response.id,
					name: response.name,
					profileUrl: "https://www.facebook.com/app_scoped_user_id/" + response.id,
					pictureUrl: undefined
				};

				this.storeProfileAsync(() => {
					console.info("[Authentication]: Account profile is updated with information of Facebook profile", !AppUtility.isDebug() ? "" : AppData.Configuration.session.account);
				});

				this.getFacebookAvatar();
			});
	}

	/** Get the avatar picture (large picture) of Facebook profile */
	getFacebookAvatar() {
		if (AppData.Configuration.session.account.facebook != null && AppData.Configuration.session.account.facebook.id != null && AppData.Configuration.session.jwt != null && AppData.Configuration.session.jwt.oauths != null
			&& AppData.Configuration.session.jwt.oauths["facebook"] && AppData.Configuration.session.jwt.oauths["facebook"] == AppData.Configuration.session.account.facebook.id) {
			FB.api("/" + AppData.Configuration.facebook.version + "/" + AppData.Configuration.session.account.facebook.id + "/picture?type=large&redirect=false&access_token=" + AppData.Configuration.facebook.token,
				(response: any) => {
					AppData.Configuration.session.account.facebook.pictureUrl = response.data.url;
					this.storeProfileAsync(() => {
						console.info("[Authentication]: Account is updated with information of Facebook profile (large profile picture)", !AppUtility.isDebug() ? "" : response);
					});
				}
			);
		}
	}

	// privileges
	async getPrivilegesAsync(id: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/" + id
				+ "?related-service=books"
				+ "&languague=vi-VN"
			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while fetching privileges of an user");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while fetching privileges of an user", e);
			onError != undefined && onError(e);
		}
	}

	async setPrivilegesAsync(id: string, privileges: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/" + id
				+ "?related-service=books"
				+ "&languague=vi-VN"
			let response = await AppAPI.PutAsync(path, privileges);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while updating privileges of an user");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while updating privileges of an user", e);
			onError != undefined && onError(e);
		}
	}

	// invitation
	async sendInvitationAsync(name: string, email: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/invite"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name)
				+ "&uri=" + AppCrypto.urlEncode(AppUtility.getUri() + "#?prego=activate&mode={mode}&code={code}");
			let body = {
				Name: name,
				Email: AppCrypto.rsaEncrypt(email),
				Campaign: "Books-Email-Invitation"
			};
			let response = await AppAPI.PostAsync(path, body);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while sending an invitation");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while sending an invitation", e);
			onError != undefined && onError(e);
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
				Email: AppCrypto.rsaEncrypt(email),
				Captcha: AppCrypto.aesEncrypt(JSON.stringify({ Registered: AppData.Configuration.session.captcha.code, Input: captcha }))
			};
			let response = await AppAPI.PutAsync(path, body);
			let data = response.json();
			if (data.Status == "OK") {
				console.info("[Authentication]: Send the request to reset password successful");
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while sending a request to reset password");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while sending a request to reset password", e);
			onError != undefined && onError(e);
		}
	}

	// update password
	async updatePasswordAsync(oldPassword: string, password: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/password"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);
			let body = {
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Password: AppCrypto.rsaEncrypt(password)
			};
			let response = await AppAPI.PutAsync(path, body);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while updating password");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while updating password", e);
			onError != undefined && onError(e);
		}
	}

	// update email
	async updateEmailAsync(oldPassword: string, email: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/account/email"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);
			let body = {
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Email: AppCrypto.rsaEncrypt(email)
			};		
			let response = await AppAPI.PutAsync(path, body);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while updating email");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while updating email", e);
			onError != undefined && onError(e);
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
			if (data.Status == "OK") {
				AppData.Configuration.session.account = this.configSvc.getAccount(true);
				await this.configSvc.updateSessionAsync(data.Data, () => {
					AppData.Configuration.session.account.id = AppData.Configuration.session.jwt.uid;
					this.configSvc.saveSessionAsync();
					console.info("Activated...", AppUtility.isDebug() ? AppData.Configuration.session : "");
				});
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Authentication]: Error occurred while activating (" + mode + ")");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while activating (" + mode + ")", e);
			onError != undefined && onError(e);
		}
	}

	async prepareOTPAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/otp"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);
			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data.Data);
			}
			else {
				console.error("[Authentication]: Error occurred while preparing OTP");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while preparing OTP");
			onError != undefined && onError(e);
		}
	}

	async updateOTPAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/otp"
				+ "?related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);
			let response = await AppAPI.PutAsync(path, info);
			let data = response.json();
			if (data.Status == "OK") {
				this.configSvc.updateAccount(data.Data);
				onNext != undefined && onNext(data.Data);
			}
			else {
				console.error("[Authentication]: Error occurred while updating OTP");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while updating OTP");
			onError != undefined && onError(e);
		}
	}

	async deleteOTPAsync(info: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/otp"
				+ "?info=" + info
				+ "&related-service=books"
				+ "&language=vi-VN"
				+ "&host=" + (AppUtility.isWebApp() ? AppUtility.getHost() : AppData.Configuration.app.name);
			let response = await AppAPI.DeleteAsync(path);
			let data = response.json();
			if (data.Status == "OK") {
				this.configSvc.updateAccount(data.Data);
				onNext != undefined && onNext(data.Data);
			}
			else {
				console.error("[Authentication]: Error occurred while deleting OTP");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while deleting OTP");
			onError != undefined && onError(e);
		}
	}

	async validateOTPAsync(id: string, otp: string, info: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let body = {
				ID: id,
				OTP: otp,
				Info: info
			};
			let response = await AppAPI.PutAsync("users/session", body);
			let data = response.json();
			if (data.Status == "OK") {
				await this.updateSessionAsync(data.Data);
				onNext != undefined && onNext(data.Data);
			}
			else {
				console.error("[Authentication]: Error occurred while validating OTP");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while validating OTP", e);
			onError != undefined && onError(e);
		}
	}

	// process RTU message
	processRTU(message: any) {
		// check status
		if (message.Type == "Error") {
			console.warn("[Authentication]: got an error message from RTU", message);
			return;
		}

		// parse
		var info = AppRTU.parse(message.Type);

		// update account
		if (info.ObjectName == "Account") {
			if (AppData.Configuration.session.account != null && AppData.Configuration.session.account.id == message.Data.ID) {
				this.configSvc.updateAccount(message.Data);
			}
		}

		// got new access token, then need to update session
		else if ((info.ObjectName == "Session")
		&& AppData.Configuration.session.id == message.Data.ID
		&& AppData.Configuration.session.account != null && AppData.Configuration.session.account.id == message.Data.UserID) {
			this.configSvc.updateSessionAsync(message.Data, () => {
				AppUtility.isDebug() && console.warn("[Authentication]: Update session with the new token", AppData.Configuration.session);
				this.configSvc.patchAccount();
				this.patchSession();
			});
		}

		// update profile
		else if (info.ObjectName == "Profile") {
			if (AppData.Configuration.session.account != null && AppData.Configuration.session.account.id == message.Data.ID) {
				this.updateProfileAsync(message.Data);
			}
			else {
				AppModels.Account.update(message.Data);
			}
		}

		// update status
		else if (info.ObjectName == "Status") {
			let account = AppData.Accounts.getValue(message.Data.UserID);
			if (account != undefined) {
				account.IsOnline = message.Data.IsOnline;
				account.LastAccess = new Date();
			}
			if (AppData.Configuration.session.account != null
				&& AppData.Configuration.session.account.id == message.Data.UserID
				&& AppData.Configuration.session.account.profile != null) {
				AppData.Configuration.session.account.profile.LastAccess = new Date();
			}
		}
	}

}