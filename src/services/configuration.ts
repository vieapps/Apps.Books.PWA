import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { Platform } from "ionic-angular";
import { Storage } from "@ionic/storage";
import { Device } from "@ionic-native/device";
import { AppVersion } from "@ionic-native/app-version";
import { List } from "linqts";

declare var FB: any;

import { AppUtility } from "../components/utility";
import { AppCrypto } from "../components/crypto";
import { AppAPI } from "../components/api";
import { AppEvents } from "../components/events";
import { AppRTU } from "../components/rtu";

import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

@Injectable()
export class ConfigurationService {

	constructor(
		public http: Http,
		public platform: Platform,
		public device: Device,
		public storage: Storage,
		public appVersion: AppVersion
	){
		AppAPI.setHttp(this.http);
		AppRTU.registerAsServiceScopeProcessor("Users", message => this.processRTU(message));
	}

	/** Prepare the working environments of the app */
	prepare(onCompleted?: (data?: any) => void) {
		// app mode
		AppData.Configuration.app.mode = this.platform.is("cordova") && this.device.platform != "browser" ? "NTA" : "PWA";

		// native app
		if (AppUtility.isNativeApp()) {
			AppData.Configuration.app.platform = this.device.platform;
			AppData.Configuration.session.device = this.device.uuid + "@" + AppData.Configuration.app.name;
		}

		// progressive web app
		else {
			AppData.Configuration.app.host = window.location.hostname;
			if (AppUtility.indexOf(AppData.Configuration.app.host, ".") > 0) {
				let host = AppUtility.toArray(AppData.Configuration.app.host, ".");
				AppData.Configuration.app.host = host[host.length - 2] + "." + host[host.length - 1];
			}

			AppData.Configuration.app.platform = this.device.platform;
			if (!AppUtility.isNotEmpty(AppData.Configuration.app.platform) || AppData.Configuration.app.platform == "browser") {
				AppData.Configuration.app.platform =
					/iPhone|iPad|iPod|Windows Phone|Android|BlackBerry|BB10|IEMobile|webOS|Opera Mini/i.test(window.navigator.userAgent)
						? /iPhone|iPad|iPod/i.test(window.navigator.userAgent)
							? "iOS"
							: /Windows Phone/i.test(window.navigator.userAgent)
								? "Windows Phone"
								: /Android/i.test(window.navigator.userAgent)
									? "Android"
									: /BlackBerry|BB10/i.test(window.navigator.userAgent)
										? "BlackBerry"
										: "Mobile"
						: "Desktop";
			}

			// add mode when working with progressive web app (PWA)
			if (AppData.Configuration.app.mode == "PWA") {
				AppData.Configuration.app.platform += " " + AppData.Configuration.app.mode;
			}

			// app version
			this.appVersion.getVersionCode()
				.then(version => {
					AppData.Configuration.app.version = version;
				})
				.catch(error => {});

			// refer
			if (AppUtility.isWebApp()) {
				let refer = this.platform.getQueryParam("refer");
				if (AppUtility.isNotEmpty(refer)) {
					try {
						refer = AppUtility.getQueryParamJson(refer);
						AppData.Configuration.app.refer = {
							id: AppUtility.isNotEmpty(refer.id) ? refer.id : "",
							section: AppUtility.isNotEmpty(refer.section) ? refer.section : ""
						};
					}
					catch (error) {}
				}
			}
		}

		onCompleted != undefined && onCompleted(AppData.Configuration);
	}

	/** Initializes the configuration settings of the app */
	async initializeAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void, noInitializeSession?: boolean) {
		// prepare environment
		AppData.Configuration.app.mode == "" && this.prepare();

		// load saved session
		if (AppData.Configuration.session.token == null || AppData.Configuration.session.keys == null) {
			await this.loadSessionAsync();
		}
		
		// initialize session
		if (AppUtility.isFalse(noInitializeSession)) {
			await this.initializeSessionAsync(onNext, onError);
		}
		else {
			onNext != undefined && onNext();
		}
	}

	/** Initializes the session with REST API */
	async initializeSessionAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.GetAsync("users/session");
			let data = response.json();
			await this.updateSessionAsync(data, () => {
				let isAuthenticated = this.isAuthenticated();
				if (isAuthenticated) {
					AppData.Configuration.session.account = AppUtility.isObject(AppData.Configuration.session.account, true)
						? AppData.Configuration.session.account
						: this.getAccount(true);
					if (!AppData.Configuration.session.account.id) {
						AppData.Configuration.session.account.id = AppData.Configuration.session.token.uid;
					}
				}
				else
					AppData.Configuration.session.account = this.getAccount(true);
				AppEvents.broadcast(isAuthenticated ? "SessionIsRegistered" : "SessionIsInitialized", AppData.Configuration.session);
				console.info("[Configuration]: The session is initialized");
				onNext != undefined && onNext(data);
			});
		}
		catch (error) {
			AppUtility.showError("[Configuration]: Error occurred while initializing the session", error, onError);
		}
	}

	/** Registers the initialized session (anonymous) with REST API */
	async registerSessionAsync(onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.GetAsync("users/session?register=" + AppData.Configuration.session.id);
			AppData.Configuration.session.account = this.getAccount(true);
			await this.saveSessionAsync(() => {
				AppEvents.broadcast("SessionIsRegistered", AppData.Configuration.session);
			});
			onNext != undefined && onNext(response.json());
		}
		catch (error) {
			AppUtility.showError("[Configuration]: Error occurred while registering the session", error, onError);
		}
	}

	/** Updates the session and stores into storage */
	async updateSessionAsync(session: any, onCompleted?: () => void) {
		if (AppUtility.isNotEmpty(session.ID)) {
			AppData.Configuration.session.id = session.ID;
		}

		if (AppUtility.isNotEmpty(session.DeviceID)) {
			AppData.Configuration.session.device = session.DeviceID;
		}

		if (AppUtility.isObject(session.Keys, true)) {
			AppData.Configuration.session.keys = {
				jwt: session.Keys.JWT,
				aes: {
					key: session.Keys.AES.Key,
					iv: session.Keys.AES.IV
				},
				rsa: {
					exponent: session.Keys.RSA.Exponent,
					modulus: session.Keys.RSA.Modulus
				}
			};
			AppCrypto.initKeys(AppData.Configuration.session.keys);
		}

		if (AppUtility.isNotEmpty(session.Token)) {
			AppData.Configuration.session.token = AppCrypto.jwtDecode(session.Token, AppUtility.isObject(AppData.Configuration.session.keys, true) ? AppData.Configuration.session.keys.jwt : AppData.Configuration.app.name);
		}

		await this.saveSessionAsync(onCompleted);
	}

	/** Loads the session from storage */
	async loadSessionAsync(onCompleted?: () => void) {
		try {
			let data = await this.storage.get("VIEApps-Session");
			if (AppUtility.isNotEmpty(data) && data != "{}") {
				AppData.Configuration.session = JSON.parse(data as string);
				if (AppData.Configuration.session.account != null && AppData.Configuration.session.account.profile != null) {
					AppData.Configuration.session.account.profile == AppModels.Account.deserialize(AppData.Configuration.session.account.profile);
				}
				AppEvents.broadcast("SessionIsLoaded", AppData.Configuration.session);
			}
		}
		catch (error) {
			AppUtility.showError("[Configuration]: Error occurred while loading the saved/offline session", error);
		}

		onCompleted != undefined && onCompleted();
	}

	/** Saves the session into storage */
	async saveSessionAsync(onCompleted?: () => void) {
		try {
			await this.storage.set("VIEApps-Session", JSON.stringify(AppUtility.clone(AppData.Configuration.session, ["jwt", "captcha"])));
		}
		catch (error) {
			AppUtility.showError("[Configuration]: Error occurred while saving/storing the session", error);
		}
		onCompleted != undefined && onCompleted();
	}

	/** Deletes the session from storage */
	async deleteSessionAsync(onCompleted?: () => void) {
		AppData.Configuration.session.id = null;
		AppData.Configuration.session.token = null;
		AppData.Configuration.session.keys = null;
		AppData.Configuration.session.account = this.getAccount(true);
		await this.storage.set("VIEApps-Session", JSON.stringify(AppUtility.clone(AppData.Configuration.session, ["captcha"])));
		onCompleted != undefined && onCompleted();
	}

	/** Send request to patch the session */
	patchSession(onNext?: () => void, defer?: number): void {
		AppUtility.setTimeout(() => {
			AppRTU.send(
				{
					ServiceName: "users",
					ObjectName: "session",
					Verb: "PATCH",
					Header: AppAPI.getAuthHeaders(),
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

	/** Gets the information of the current/default account */
	getAccount(getDefault?: boolean) {
		let account = AppUtility.isTrue(getDefault) || AppData.Configuration.session.account == null
			? undefined
			: AppData.Configuration.session.account;
		return account || new AppData.Account();
	}

	/** Prepares account information */
	prepareAccount(data: any) {
		let account: { 
			Roles: Array<string>, 
			Privileges: Array<AppModels.Privilege>, 
			Status: string, 
			TwoFactorsAuthentication: { Required: boolean, Providers: Array<{Label: string, Type: string, Time: Date, Info: string}> }
		} = {
			Roles: [],
			Privileges: [],
			Status: "Registered",
			TwoFactorsAuthentication: {
				Required: false,
				Providers: new Array<{Label: string, Type: string, Time: Date, Info: string}>()
			}
		};

		if (data.Roles && AppUtility.isArray(data.Roles)) {
			account.Roles = new List<string>(data.Roles)
				.Select(r => r.trim())
				.Distinct()
				.ToArray();
		}

		if (data.Privileges && AppUtility.isArray(data.Privileges)) {
			account.Privileges = new List<any>(data.Privileges)
				.Select(p => AppModels.Privilege.deserialize(p))
				.ToArray();
		}

		if (AppUtility.isNotEmpty(data.Status)) {
			account.Status = data.Status as string;
		}

		if (AppUtility.isObject(data.TwoFactorsAuthentication, true)) {
			account.TwoFactorsAuthentication.Required = AppUtility.isTrue(data.TwoFactorsAuthentication.Required);
			if (AppUtility.isArray(data.TwoFactorsAuthentication.Providers)) {
				account.TwoFactorsAuthentication.Providers = new List<any>(data.TwoFactorsAuthentication.Providers).Select(p => {
					return {
						Label: p.Label,
						Type: p.Type,
						Time: new Date(p.Time),
						Info: p.Info
					};
				}).ToArray();
			}
		}

		return account;
	}

	/** Updates information of the account */
	updateAccount(data: any, onCompleted?: () => void) {
		let info = this.prepareAccount(data);
		AppData.Configuration.session.account.roles = info.Roles;
		AppData.Configuration.session.account.privileges = info.Privileges;
		AppData.Configuration.session.account.status = info.Status;
		AppData.Configuration.session.account.twoFactors = {
			required: info.TwoFactorsAuthentication.Required,
			providers: info.TwoFactorsAuthentication.Providers
		};
		onCompleted != undefined && onCompleted();
	}

	/** Send request to patch information of the account */
	patchAccount(onNext?: () => void, defer?: number) {
		AppUtility.setTimeout(() => {
			AppRTU.send(
				{
					ServiceName: "users",
					ObjectName: "account",
					Verb: "GET",
					Query: { "x-status": "" }
				},
				() => {
					onNext != undefined && onNext();
				},
				observable => {
					observable.map(response => response.json()).subscribe(
						data => {
							this.updateAccount(data);
							onNext != undefined && onNext();
						},
						error => {
							AppUtility.showError("[Configuration]: Error occurred while patching an account", error);
						}
					);
				}
			);
		}, defer || 345);
	}

	/** Performs a request to REST API to search account profiles */
	searchAccounts(request: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		let pagination = AppData.Paginations.get(request, "Accounts");
		if (pagination != null && pagination.PageNumber >= pagination.TotalPages) {
			onNext != undefined && onNext();
			return;
		}

		request.Pagination.PageNumber++;
		let path = "users/profile/search"
			+ "?x-request=" + AppUtility.getBase64UrlParam(request)
			+ "&related-service=" + AppData.Configuration.app.service
			+ "&language=" + AppData.Configuration.session.account.profile.Language;

		let searcher = AppAPI.Get(path);
		if (!onNext) {
			return searcher;
		}

		searcher.map(response => response.json()).subscribe(
			data => {
				AppData.Paginations.set(data, "Accounts");
				new List<any>(data.Objects).ForEach(a => AppModels.Account.update(a));
				onNext(data);
			},
			error => {
				AppUtility.showError("[Configuration]: Error occurred while searching accounts", error, onError);
			}
		);
	}
	
	/** Get profile information */
	getProfile(id?: string, onCompleted?: (data?: any) => void) {
		let request = {
			ServiceName: "users",
			ObjectName: "profile",
			Verb: "GET",
			Query: {
				"related-service": AppData.Configuration.app.service,
				"language": "vi-VN",
				"host": AppUtility.getHost()
			}
		};
		if (AppUtility.isNotEmpty(id)) {
			request.Query["object-identity"] = id;
		}

		AppRTU.send(request,
			() => {
				onCompleted != undefined && onCompleted();
			},
			observable => {
				observable.map(response => response.json()).subscribe(
					data => {
						this.updateProfileAsync(data, onCompleted);
					},
					error => {
						AppUtility.showError("[Configuration]: Error occurred while fetching a profile", error);
					}
				);
			}
		);
	}

	/** Get profile information of an account */
	async getProfileAsync(dontUseRTU?: boolean, id?: string, onCompleted?: (data?: any) => void) {
		if (AppUtility.isFalse(dontUseRTU) && id == undefined && AppRTU.isReady()) {
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
					+ "?related-service=" + AppData.Configuration.app.service
					+ "&language=vi-VN"
					+ "&host=" + AppUtility.getHost();
				let response = await AppAPI.GetAsync(path);
				this.updateProfileAsync(response.json(), onCompleted);
			}
			catch (error) {
				AppUtility.showError("[Configuration]: Error occurred while fetching account profile", error, onCompleted);
			}
		}
	}

	/** Update the information of an account profile */
	async updateProfileAsync(data: any, onCompleted?: (data?: any) => void) {
		// update profile into collection of accounts
		AppModels.Account.update(data);

		// update profile of current user
		if (AppData.Configuration.session.token != null && AppData.Configuration.session.token.uid == data.ID) {
			AppData.Configuration.session.account.id = data.ID;
			AppData.Configuration.session.account.profile = AppData.Accounts.getValue(data.ID);
			await this.storeProfileAsync(() => {
				AppUtility.isDebug() && console.info("[Configuration]: Account profile is updated", AppData.Configuration.session.account);
				onCompleted != undefined && onCompleted(AppData.Configuration.session.account);
			});
			AppData.Configuration.facebook.token != null && AppData.Configuration.facebook.id != null && this.getFacebookProfile();
		}

		// callback when the profile is not profile of current user account
		else {
			onCompleted != undefined && onCompleted(data);
		}
	}

	/** Store the information of current account profile into storage */
	async storeProfileAsync(onCompleted?: (data?: any) => void) {
		await this.saveSessionAsync();
		AppEvents.broadcast("AccountIsUpdated", { Type: "Profile" });
		onCompleted != undefined && onCompleted(AppData.Configuration.session);
	}

	/** Perform save profile information (with REST API) */
	async saveProfileAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let path = "users/profile"
				+ "?related-service=" + AppData.Configuration.app.service
				+ "&language=" + AppData.Configuration.session.account.profile.Language;
			let response = await AppAPI.PutAsync(path, info);
			await this.updateProfileAsync(response.json(), onNext);
		}
		catch (error) {
			AppUtility.showError("[Configuration]: Error occurred while updating account profile", error, onError);
		}
	}

	/** Watch the connection of Facebook */
	watchFacebookConnect() {
		FB.Event.subscribe("auth.authResponseChange",
			response => {
				if (response.status === "connected") {
					AppData.Configuration.facebook.token = response.authResponse.accessToken;
					AppData.Configuration.facebook.id = response.authResponse.userID;
					console.info("[Configuration]: Facebook is connected", !AppUtility.isDebug() ? "" : AppData.Configuration.facebook);

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
			response => {
				AppData.Configuration.session.account.facebook = {
					id: response.id,
					name: response.name,
					profileUrl: "https://www.facebook.com/app_scoped_user_id/" + response.id,
					pictureUrl: undefined
				};

				this.storeProfileAsync(() => {
					console.info("[Configuration]: Account profile is updated with information of Facebook profile", !AppUtility.isDebug() ? "" : AppData.Configuration.session.account);
				});

				this.getFacebookAvatar();
			});
	}

	/** Get the avatar picture (large picture) of Facebook profile */
	getFacebookAvatar() {
		if (AppData.Configuration.session.account.facebook != null && AppData.Configuration.session.account.facebook.id != null && AppData.Configuration.session.token != null && AppData.Configuration.session.token.oauths != null
			&& AppData.Configuration.session.token.oauths["facebook"] && AppData.Configuration.session.token.oauths["facebook"] == AppData.Configuration.session.account.facebook.id) {
			FB.api("/" + AppData.Configuration.facebook.version + "/" + AppData.Configuration.session.account.facebook.id + "/picture?type=large&redirect=false&access_token=" + AppData.Configuration.facebook.token,
				response => {
					AppData.Configuration.session.account.facebook.pictureUrl = response.data.url;
					this.storeProfileAsync(() => {
						console.info("[Configuration]: Account is updated with information of Facebook profile (large profile picture)", !AppUtility.isDebug() ? "" : response);
					});
				}
			);
		}
	}

	/** Gets the state that determines the app is ready to go */
	isReady() {
		return AppUtility.isObject(AppData.Configuration.session.keys, true) && AppUtility.isObject(AppData.Configuration.session.token, true);
	}

	/** Gets the state that determines the current account is authenticated or not */
	isAuthenticated() {
		return AppUtility.isObject(AppData.Configuration.session.token, true) && AppUtility.isNotEmpty(AppData.Configuration.session.token.uid);
	}

	// process RTU message
	processRTU(message: any) {
		// parse
		let info = AppRTU.parse(message.Type);

		// update account
		if (info.Object == "Account") {
			if (AppData.Configuration.session.account && AppData.Configuration.session.account.id == message.Data.ID) {
				this.updateAccount(message.Data);
			}
		}

		// update session
		else if (info.Object == "Session"
		&& AppData.Configuration.session.id == message.Data.ID
		&& AppData.Configuration.session.account && AppData.Configuration.session.account.id == message.Data.UserID) {
			// update session with new access token
			if (info.Event == "Update") {
				this.updateSessionAsync(message.Data, () => {
					AppUtility.isDebug() && console.warn("[Configuration]: Update session with the new token", AppUtility.isDebug() ? AppData.Configuration.session : "");
					this.patchAccount();
					this.patchSession();
				});
			}

			// revoke current session
			else if (info.Event == "Revoke") {
				this.deleteSessionAsync(() => {
					AppEvents.broadcast("AccountIsUpdated", { Type: "Revoke" });
					this.initializeAsync(() => {
						this.registerSessionAsync(() => {
							console.info("[Configuration]: Revoke session successful", AppUtility.isDebug() ? AppData.Configuration.session : "");
							AppEvents.broadcast("OpenHomePage");
							this.patchSession();
						});
					})
				});
			}

			// online status
			else if (info.Event == "Status") {
				let account = AppData.Accounts.getValue(message.Data.UserID);
				if (account != undefined) {
					account.IsOnline = message.Data.IsOnline;
					account.LastAccess = new Date();
				}
				if (AppData.Configuration.session.account != null
					&& AppData.Configuration.session.id == message.Data.SessionID
					&& AppData.Configuration.session.account.id == message.Data.UserID
					&& AppData.Configuration.session.account.profile != null) {
					AppData.Configuration.session.account.profile.LastAccess = new Date();
				}
			}
		}

		// update profile
		else if (info.Object == "Profile") {
			if (AppData.Configuration.session.account && AppData.Configuration.session.account.id == message.Data.ID) {
				this.updateProfileAsync(message.Data);
			}
			else {
				AppModels.Account.update(message.Data);
			}
		}
	}

}