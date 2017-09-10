import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { List } from "linqts";
import "rxjs/add/operator/toPromise";
import "rxjs/add/operator/map";

declare var FB: any;

import { AppUtility } from "../helpers/utility";
import { AppCrypto } from "../helpers/crypto";
import { AppAPI } from "../helpers/api";
import { AppRTU } from "../helpers/rtu";
import { AppEvents } from "../helpers/events";
import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

import { ConfigurationService } from "./configuration";

@Injectable()
export class AuthenticationService {

	constructor(public http: Http, public configSvc: ConfigurationService) {
		AppAPI.setHttp(this.http);
		AppRTU.register("Users", (message: any) => this.processRTU(message));
	}

	/** Checks to see the current account is authenticated or not */
	isAuthenticated() {
		return this.configSvc.isAuthenticated();
	}

	/** Checks to see the account is system administrator or not */
	isSystemAdministrator(account?: any) {
		account = account || this.configSvc.getAccount();
		return account && AppUtility.isNotEmpty(account.id) && AppUtility.isArray(account.roles)
			&& (new List<string>(account.roles).FirstOrDefault(r => r == "SystemAdministrator")) != undefined;
	}

	/** Checks to see the account is administrator or not */
	isAdministrator(account?: any) {
		account = account || this.configSvc.getAccount();
		return this.isSystemAdministrator(account)
			|| (account && AppUtility.isNotEmpty(account.id) && AppUtility.isArray(account.roles)
			&& (new List<string>(account.roles).FirstOrDefault(r => r == "Administrator")) != undefined);
	}

	/** Gets the working role of an account */
	getRole(account?: any) {
		account = account || this.configSvc.getAccount();
		return this.isSystemAdministrator(account)
			? "Administrator"
			: account && AppUtility.isNotEmpty(account.id) && AppUtility.isArray(account.roles)
				&& new List<string>(account.roles).FirstOrDefault(r => r == "Authenticated") != undefined
				? "User"
				: "Anonymous";
	}

	/** Checks to see the account is authorized to do a specified action on a specified section */
	isAuthorized(serviceName: string, objectName: string, action: string) {
		serviceName = AppUtility.isNotEmpty(serviceName) ? serviceName : "";
		objectName = AppUtility.isNotEmpty(objectName) ? objectName : "";
		action = AppUtility.isNotEmpty(action) ? action : "";

		var account = this.configSvc.getAccount();
		var privileges = account != null && AppUtility.isArray(account.privileges)
			? account.privileges as Array<AppModels.Privilege>
			: new Array<AppModels.Privilege>();
		var matched = new List(privileges).FirstOrDefault(p => p.ServiceName == serviceName && p.ObjectName == objectName);

		return matched != undefined
			? new List(matched.Actions).FirstOrDefault(a => a == "Full" || a == action) != undefined
			: false;
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
				await this.configSvc.updateSessionAsync(data.Data);
				if (AppData.Configuration.session.account == null) {
					AppData.Configuration.session.account = this.configSvc.getAccount(true);
				}
				AppData.Configuration.session.account.id = AppData.Configuration.session.jwt.uid;

				console.info("[Authentication]: Sign-in successful", AppUtility.isDebug() ? AppData.Configuration.session : "");
				AppEvents.broadcast("SessionIsRegistered");

				this.patchSession(() => {
					this.configSvc.patchAccount(() => {
						this.getProfile();
					});
				}, 123);
				onNext != undefined && onNext(data);
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
	async getLibrariesAsync(onCompleted?: (d: any) => void) {
		try {
			let response = await AppAPI.GetAsync("accounts/libraries");
			let data = response.json();
			if (data.Status == "OK") {
				if (onCompleted != undefined) {
					onCompleted(data);
				}
			}
			else {
				console.error("[Authentication]: Error occurred while fetching accounts' libraries");
				if (AppUtility.isObject(data.Error, true)) {
					console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				}
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while fetching accounts' libraries", e);
		}
	}

	async setPrivilegesAsync(body: any, onNext?: (d: any) => void, onError?: (e: any) => void) {
		try {
			let response = await AppAPI.PostAsync("accounts/privileges", body);
			let data = response.json();
			if (data.Status == "OK") {
				AppModels.Account.update(data.Data);
				if (onNext != undefined) {
					onNext(data);
				}
			}
			else {
				console.error("[Authentication]: Error occurred while updating privileges of the account");
				if (AppUtility.isObject(data.Error, true)) {
					console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				}

				if (onError != undefined) {
					onError(data);
				}
			}
		}
		catch (e) {
			console.error("[Authentication]: Error occurred while updating privileges of the account", e);
			if (onError != undefined) {
				onError(e);
			}
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
				Timestamp: Math.round(+new Date() / 1000),
				Name: name,
				Email: AppCrypto.rsaEncrypt(email),
				Session: AppCrypto.aesEncrypt(AppData.Configuration.session.id),
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
				Timestamp: Math.round(+new Date() / 1000),
				Email: AppCrypto.rsaEncrypt(email),
				Session: AppCrypto.aesEncrypt(AppData.Configuration.session.id),
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
				Timestamp: Math.round(+new Date() / 1000),
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Password: AppCrypto.rsaEncrypt(password),
				Session: AppCrypto.aesEncrypt(AppData.Configuration.session.id)
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
				Timestamp: Math.round(+new Date() / 1000),
				OldPassword: AppCrypto.rsaEncrypt(oldPassword),
				Email: AppCrypto.rsaEncrypt(email),
				Session: AppCrypto.aesEncrypt(AppData.Configuration.session.id)
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
			this.configSvc.updateAccount(message.Data);
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
			if (AppData.Configuration.session.account != null && AppData.Configuration.session.account.id == message.Data.UserID && AppData.Configuration.session.account.profile != null) {
				AppData.Configuration.session.account.profile.LastAccess = new Date();
			}
		}

		// new permissions (new access token)
		else if (message.Verb == "Permissions" && AppData.Configuration.session.account.profile != null) {
			this.updateProfileAsync(message.Data.Profile, () => {
				this.configSvc.updateSessionAsync(message.Data, () => {
					AppRTU.restart("Re-start when got the new access token...", 1234);
				});
			});
		}
	}

}