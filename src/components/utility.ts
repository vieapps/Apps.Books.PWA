import { ElementRef, Pipe } from "@angular/core";
import { DecimalPipe } from "@angular/common";
import { Response } from "@angular/http";

import { Keyboard } from "@ionic-native/keyboard";
import { GoogleAnalytics } from "@ionic-native/google-analytics";
import { List } from "linqts";

import { AppCrypto } from "./crypto";
import { AppData } from "../models/data";

declare var FB: any;

@Pipe({
  name: "vinumber"
})
export class VinumberPipe extends DecimalPipe {
  transform(value: number): string {
		return super.transform(value, "1.2-2").replace(".", "#").replace(/,/g, ".").replace("#", ",").replace(",00", "");
  }
}

export namespace AppUtility {
	/** Checks to see the object is boolean and equals to true */
	export function isTrue(obj?: any) {
		return obj != undefined && typeof obj == "boolean" && obj === true;
	}

	/** Checks to see the object is boolean (or not defined) and equals to false */
	export function isFalse(obj?: any) {
		return obj == undefined || (typeof obj == "boolean" && obj === false);
	}

	/**
	  * Checks to see the object is really object or not
	  * @param obj The object for checking
	  * @param notNull true to check null of the object
	*/
	export function isObject(obj?: any, notNull?: boolean) {
		return obj != undefined && typeof obj == "object" && (isTrue(notNull) ? obj != null : true);
	}

	/** Checks to see the object is array or not */
	export function isArray(obj?: any) {
		return obj instanceof Array;
	}

	/** Checks to see the object is date or not */
	export function isDate(obj?: any) {
		return obj instanceof Date;
	}

	/** Checks to see the object is null or not */
	export function isNull(obj?: any) {
		return obj == undefined || obj == null;
	}

	/** Checks to see the object is defined and null or not */
	export function isNotNull(obj?: any) {
		return obj != undefined && obj != null;
	}

	/** Checks to see the string is defined and not empty */
	export function isNotEmpty(obj?: string) {
		return isNotNull(obj) && typeof obj == "string" && obj.trim() != "";
	}

	/** Gets the state that determines the emai address is valid or not */
	export function isValidEmail(email?: string) {
		var atPos = isNotEmpty(email) ? email.indexOf("@") : -1;
		var dotPos = isNotEmpty(email) ? email.indexOf(".", atPos + 1) : -1;
		return atPos > 0 && dotPos > atPos;
	}

	/** Checks the error to see that is security exception or not */
	export function isGotSecurityException(error?: any) {
		return isObject(error, true) && isNotEmpty(error.Type)
			? new List(securityExceptions).FirstOrDefault(e => e == error.Type) != undefined
			: false;
	}

	const securityExceptions: Array<string> = [
		"UnauthorizedException", "AccessDeniedException",
		"SessionNotFoundException", "SessionExpiredException", "SessionInformationRequiredException", "InvalidSessionException",
		"TokenNotFoundException", "TokenExpiredException", "TokenRevokedException", "InvalidTokenException", "InvalidTokenSignatureException"
	];

	export function isGotWrongAccountOrPasswordException(error?: any) {
		return isObject(error, true) && isNotEmpty(error.Type)
			? error.Type == "WrongAccountException"
			: false;
	}

	export function isGotCaptchaException(error?: any) {
		return isObject(error, true) && isNotEmpty(error.Type) && isNotEmpty(error.Message)
			? error.Type == "InformationInvalidException" && error.Message.indexOf("Captcha code is invalid") > -1
			: false;
	}

	/** Gets the state that determines is native app */
	export function isNativeApp() {
		return AppData.Configuration.app.mode == "NTA";
	}

	/** Gets the state that determines is web progressive app */
	export function isWebApp() {
		return AppData.Configuration.app.mode == "PWA";
	}

	/** Gets the state that determines the app is running on Apple iOS */
	export function isAppleOS() {
		return AppData.Configuration.app.platform.indexOf("iOS") == 0;
	}

	/** Gets the state that determines the app is running in debug mode */
	export function isDebug() {
		return AppData.Configuration.app.debug;
	}

	/**
	 * Copys data from the source (object or JSON) into the objects' properties
	 * @param {any} source The source (object or JSON) to copy data from
	 * @param {any} obj The instance of an object to copy data into
	 * @param {function} onPreCompleted The handler to run when copying process is completed
	*/
	export function copy(source: any, obj: any, onPreCompleted?: (data: any) => void) {
		try {
			let data = isNotEmpty(source)
			? JSON.parse(source)
			: isObject(source, true)
				? source
				: {};

			for (let name in data) {
				let type = typeof obj[name];
				if (type !== "undefined" && type !== "function") {
					obj[name] = isDate(obj[name])
						? new Date(data[name])
						: data[name];
				}
			}

			onPreCompleted != undefined && onPreCompleted(data);
		}
		catch (e) {
			console.error("[Utility]: Error occurred while copying object", e, source);
		}	
	}

	/**
	 * Cleans null and undefined properties from the object
	 * @param {any} instance The instance of an object to process
	 * @param {function} onPreCompleted The handler to run when cleaning process is completed
	*/
	export function clean(instance: any, onPreCompleted?: (obj: any) => void) {
		let propperties = Object.getOwnPropertyNames(instance);
		for (let index = 0; index < propperties.length; index++) {
			var name = propperties[index];
			if (instance[name] === null || instance[name] === undefined) {
				delete instance[name];
			}
			else if (isObject(instance[name])) {
				clean(instance[name]);
				if (Object.getOwnPropertyNames(instance[name]).length < 1) {
					delete instance[name];
				}
			}
		}
		onPreCompleted != undefined && onPreCompleted(instance);
		return instance;
	}

	/**
	  * Clones the object (means do stringify the source object and re-parse via JSON (need to re-update all special attributes, like Date, Collection, ... manually)
	  * @param source The source object for cloning
	  * @param beRemoved The array of attributes of the cloning object to be removed before returing
	*/
	export function clone(source?: any, beRemoved?: Array<string>): any {
		var exists = [];
		var json = JSON.stringify(source, (key: string, value: any) => {
			if (isObject(value, true)) {
				if (exists.indexOf(value) !== -1) {
					return;
				}
				exists.push(value);
			}
			return value;
		});
		var obj = JSON.parse(json);
		if (beRemoved != undefined) {
			new List(beRemoved).ForEach(a => delete obj[a]);
		}
		return obj;
	}

	/**
	  * Sets focus into a control
	  * @param control The control to set focus
	  * @param keyboard The keyboard of the device to show (not work on iOS because the OS's limits)
	  * @param defer Defer time (in miliseconds)
	*/
	export function focus(control: any, keyboard?: Keyboard, defer?: number) {
		// stop if has no control
		if (!control) {
			return;
		}

		// not Apple iOS
		if (!isAppleOS()) {
			if (typeof control.setFocus == "function" || typeof control.focus == "function") {
				setTimeout(() => {
					if (typeof control.setFocus == "function") {
						control.setFocus();
					}
					else {
						control.focus();
					}
					isNotNull(keyboard) && isNativeApp() && keyboard.show();
				}, defer || (isNativeApp() ? 456 : 345));
			}
			else if (control instanceof ElementRef) {
				setTimeout(() => {
					(control as ElementRef).nativeElement.focus();
					isNotNull(keyboard) && isNativeApp() && keyboard.show();
				}, defer || (isNativeApp() ? 234 : 123));
			}
		}

		// Apple iOS => use native element instead of Ionic element
		else {
			let ctrl = control instanceof ElementRef
				? (control as ElementRef).nativeElement
				: control._elementRef && control._elementRef instanceof ElementRef
					? (control._elementRef as ElementRef).nativeElement
					: undefined;
			ctrl != undefined && setTimeout(() => {
				ctrl.focus();
			}, defer || 345);
		}
	}

	/** Gets the position of the sub-string in the string */
	export function indexOf(str: string, substr: string, start?: number) {
		return isNotEmpty(str) && isNotEmpty(substr)
			? str.indexOf(substr, start)
			: -1;
	}

	/** Finds the index of an item in the sequence base on a predicate */
	export function find<T>(items: Array<T>, predicate: (item: T) => boolean): number {
		for (let index = 0; index < items.length; index++) {
			if (predicate(items[index])) {
				return index;
			}
		}
		return -1;
	}

	/** Removes items in the sequence base on number that count from end */
	export function splice<T>(items: Array<T>, number?: number) {
		number = number || 1;
		let index = items.length - number;
		if (index > 0 && index < items.length) {
			items.splice(index, number);
		}
	}

	/**
	 * Sets time-out to run a function
	 * @param action The action to run
	 * @param defer The defer times (in miliseconds)
	 */
	export function setTimeout(action: () => void, defer?: number) {
		action != undefined && action != null && window.setTimeout(() => {
			action();
		}, defer || 0);
	}

	/** Gets the avatar image */
	export function getAvatarImage(info?: any, noAvatar?: string) {
		let avatar: string = isObject(info, true) && isNotEmpty(info.Avatar)
			? info.Avatar
			: isObject(info, true) && isNotEmpty(info.Gravatar)
				? info.Gravatar
				: "";
		if (avatar == "" && isObject(info, true))
		{
			noAvatar = isNotEmpty(noAvatar)
				? noAvatar
				: AppData.Configuration.app.uris.files + "avatars/" + AppData.Configuration.app.host + "-no-avatar.png";
			let email = isObject(info.Contact, true)
				? info.Contact.Email
				: info.Email;
			return isNotEmpty(email)
				? "https://secure.gravatar.com/avatar/" + AppCrypto.md5(email.toLowerCase().trim()) + "?s=300&d=" + encodeURIComponent(noAvatar)
				: noAvatar;
		}
		return avatar;
	}

	/** Gets the query from JSON */
	export function getQuery(json: any): string {
		try {
			let query = "";
			if (isObject(json, true)) {
				for(let name in json) {
					query += (query != "" ? "&" : "") + name + "=" + encodeURIComponent(json[name]);
				}
			}
			return query;
		}
		catch (e) {
			return "";
		}
	}

	/** Gets the JSON of a query param (means decode by Base64Url and parse to JSON) */
	export function getQueryParamJson(value: string): any {
		try {
			return isNotEmpty(value)
				? JSON.parse(AppCrypto.urlDecode(value))
				: {};
		}
		catch (e) {
			return {};
		}
	}

	/** Gets the string parameter for making request to REST API (means stringify the JSON and encode by Base64Url) */
	export function getBase64UrlParam(json: any) {
		return isObject(json, true)
			? AppCrypto.urlEncode(JSON.stringify(json))
			: "";
	}

	/** Gets the current host name */
	export function getHost() {
		if (indexOf(window.location.hostname, ".") < 0) {
			return window.location.hostname;
		}
		let info = toArray(window.location.hostname, ".");
		let host = info[info.length - 2] + "." + info[info.length - 1];
		if (info.length > 2 && info[info.length - 3] != "www") {
			host = info[info.length - 3] + "." + host;
		}
		return host;
	}

	/** Opens an uri by OS/In-App browser */
	export function openUri(uri?: string) {
		if (isNotEmpty(uri) && indexOf(uri, "http") == 0) {
			window.open(uri);
		}
	}

	/** Parses an uri */
	export function parseUri(uri?: string) {
		let parser = document.createElement("a");
		parser.href = uri || window.location.href;

		// convert query string to object
		let searchParams = {}
		if (parser.search != "") {
			let queries = parser.search.replace(/^\?/, "").split("&");
			for (let index = 0; index < queries.length; index++ ) {
				let split = queries[index].split("=");
				searchParams[split[0]] = split[1];
			}
		}

		// convert hash string to object
		let hashParams = {}
		let hash = parser.hash;
		while (hash.indexOf("#") == 0 || hash.indexOf("?") == 0) {
			hash = hash.substring(1);
		}
		if (hash != "") {
			let queries = hash.replace(/^\?/, "").split("&");
			for (let index = 0; index < queries.length; index++ ) {
				let split = queries[index].split("=");
				hashParams[split[0]] = split[1];
			}
		}
		
		return {
			protocol: parser.protocol + "//",
			host: parser.hostname,
			port: parser.port,
			path: parser.pathname,
			search: parser.search,
			searchParams: searchParams,
			hash: parser.hash,
			hashParams: hashParams
		};
	}

	/** Normalizes and resets uri of current window location HREF */
	export function resetUri(params?: any) {
		// only available for web app (means PWA)
		if (!isWebApp()) {
			return;
		}

		// prepare included
		let uri = parseUri(window.location.href);
		let included = {};
		if (isObject(params, true)) {
			for (let param in params) {
				if (param != "") {
					included[param] = true
				}
			}
		}
		else {
			for (let param in uri.hashParams) {
				included[param] = true
			}
		}

		// add params into url
		let addedParams = {}
		let url = uri.protocol + uri.host + (uri.port != "" ? ":" + uri.port : "") + uri.path + "#?";
		if (isObject(params, true)) {
			for (let param in params) {
				if (included[param] && !addedParams[param]) {
					url += param + (params[param] != undefined ? "=" + params[param] : "") + "&";
					addedParams[param] = true;
				}
			}
		}
		for (let param in uri.hashParams) {
			if (included[param] && !addedParams[param]) {
				url += param + (uri.hashParams[param] != undefined ? "=" + uri.hashParams[param] : "") + "&";
				addedParams[param] = true;
			}
		}

		// reset
		window.location.href = url.substring(0, url.length - 1);
	}

	/** Gets the URI of current request */
	export function getUri() {
		if (!isWebApp() || indexOf(window.location.href, "file://") > - 1) {
			return AppData.Configuration.app.uris.activations;
		}
		else {
			let uri = parseUri();
			return uri.protocol + uri.host + (uri.port != "" ? ":" + uri.port : "") + uri.path;
		}
	}

	/** Gets the CSS classes for working with label */
	export function getTextLabelCss() {
		return "label " + (isAppleOS() ? "label-ios" : "label-md");
	}

	/** Gets the CSS classes for working with input control */
	export function getTextInputCss() {
		return "text-input " + (isAppleOS() ? "text-input-ios" : "text-input-md");
	}

	/** Get the button for working with action sheet */
	export function getActionButton(text: string, icon?: string, handler?: () => boolean | void, role?: string) {
		return {
			text: text,
			icon: isAppleOS() ? undefined : icon,
			handler: handler,
			role: role
		};
	}

	/** Gets the array of objects with random scoring number (for ordering) */
	export function getTopScores(objects: Array<any>, take?: number, excluded?: string, dontAddRandomScore?: boolean, nameOfRandomScore?: string) {
		dontAddRandomScore = dontAddRandomScore != undefined
			? dontAddRandomScore
			: false;
		nameOfRandomScore = nameOfRandomScore != undefined
			? nameOfRandomScore
			: "Score";

		var list = new List(objects);
		if (excluded != undefined) {
			list = list.Where(o => excluded != o.ID);
		}
		list = list.Select(o => {
			let i = clone(o);
			if (isFalse(dontAddRandomScore)) {
				i[nameOfRandomScore] = Math.random();
			}
			return i;
		});
		if (isFalse(dontAddRandomScore)) {
			list = list.OrderByDescending(i => i[nameOfRandomScore]);
		}
		if (take != undefined) {
			list = list.Take(take);
		}
		return list.ToArray();
	}

	var counties: any = {};

	/** Gets the listing of counties of a specified country */
	export function getCounties(country?: string) {
		country = isNotEmpty(country)
			? country
			: AppData.Configuration.meta.country;
		if (!counties[country]) {
			let theCounties: Array<any> = [];
			new List<any>(AppData.Configuration.meta.provinces[country]
				? AppData.Configuration.meta.provinces[country].provinces
				: []
			).ForEach(p => {
				new List<any>(p.counties).ForEach(c => {
					theCounties.push({
						county: c.title,
						province: p.title,
						country: country,
						title: c.title + ", " + p.title + ", " + country,
						titleANSI: toANSI(c.title + ", " + p.title + ", " + country)
					});
				});
			});
			counties[country] = theCounties;
		}
		return counties[country] as Array<any>;
	}

	/** Initializes an address for working with type-a-head */
	export function initializeAddress(address?: any): { current: any, addresses: Array<any> } {
		var info = {
			addresses: getCounties(),
			current: undefined
		};

		address = isObject(address, true)
			? {
					county: isNotEmpty(address.county) ? address.county : isNotEmpty(address.County) ? address.County : "",
					province: isNotEmpty(address.province) ? address.province : isNotEmpty(address.Province) ? address.Province : "",
					country: isNotEmpty(address.country) ? address.country : isNotEmpty(address.Country) ? address.Country : ""
				}
			: {
					county: "",
					province: "",
					country: ""
				};

		info.current = address.county == "" && address.province == "" && address.country == ""
			? undefined
			: new List(info.addresses).FirstOrDefault(a => a.county == address.county && a.province == address.province && a.country == address.country);

		return info;
	}

	/** Opens Google Maps by address or location via query */
	export function openGoogleMaps(info: string) {
		window.open("https://www.google.com/maps?q=" + encodeURIComponent(info));
	}

	var googleAnalytics: GoogleAnalytics = null;

	/** Sets the object of Google Analytics */
	export function setGoogleAnalytics(ga: GoogleAnalytics) {
		if (AppData.Configuration.app.tracking.google != "") {
			googleAnalytics = ga;
			googleAnalytics.startTrackerWithId(AppData.Configuration.app.tracking.google)
				.then(() => {
					googleAnalytics.setAppVersion(AppData.Configuration.app.version);
					isDebug() && console.info("Google Analytics is ready now...", googleAnalytics);
				})
				.catch((e) => {
					console.error("Error occurred while starting Google Analytics", e);
					googleAnalytics = null;
				});
		}
	}

	/** Tracks a page-view */
	export function trackPageView(title?: string, path?: string, params?: any) {
		// prepare url
		let url = "";
		if (isObject(params, true)) {
			for (let param in params) {
				url += (url != "" ? "&" : "") + param + "=" + params[param];
			}
		}
		let uri = parseUri();
		url = uri.path + (isNotEmpty(path) ? path + "/" : "") + (uri.hash != "" ? uri.hash + "&" : "#?") + url;

		// Google Analytics
		if (googleAnalytics) {
			googleAnalytics.trackView(title || document.title, uri.protocol + uri.host + url);
		}
	}

	/** Sets environments of the PWA */
	export function setPWAEnvironment() {
		// Javascript libraries (only available when working in web browser)
		if (window.location.href.indexOf("file://") < 0) {
			// Facebook SDK
			if (AppUtility.isNotEmpty(AppData.Configuration.facebook.id)) {
				let version = AppUtility.isNotEmpty(AppData.Configuration.facebook.version)
					? AppData.Configuration.facebook.version
					: "v2.12";
				if (!window.document.getElementById("facebook-jssdk")) {
					let js = window.document.createElement("script");
					js.id = "facebook-jssdk";
					js.async = true;
					js.src = "https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=" + version;

					let ref = window.document.getElementsByTagName("script")[0];
					ref.parentNode.insertBefore(js, ref);
				}
				window["fbAsyncInit"] = function () {
					FB.init({
						appId: AppData.Configuration.facebook.id,
						channelUrl: "/assets/facebook.html",
						status: true,
						cookie: true,
						xfbml: true,
						version: version
					});
					this.auth.watchFacebookConnect();
				};
			}
		}

		// scrollbars (on Windows & Linux)
		if (/Windows/i.test(window.navigator.userAgent) || /Linux/i.test(window.navigator.userAgent)) {
			let css = window.document.createElement("style");
			css.type = "text/css";
			css.innerText = "::-webkit-scrollbar{height:14px;width:10px;background:#eee;border-left:solid1px#ddd;}::-webkit-scrollbar-thumb{background:#ddd;border:solid1px#cfcfcf;}::-webkit-scrollbar-thumb:hover{background:#b2b2b2;border:solid1px#b2b2b2;}::-webkit-scrollbar-thumb:active{background:#b2b2b2;border:solid1px#b2b2b2;}";

			let ref = window.document.getElementsByTagName("link")[0];
			ref.parentNode.insertBefore(css, ref);
		}
	}

	/** Show error to console and run next action */
	export function showError(message: string, error: any, next?: (error?: any) => void) {
		try {
			error = error != undefined && error instanceof Response && typeof error.json == "function"
				? error.json()
				: error;
		}
		catch (e) {}

		if (isObject(error, true) && error.Type && error.Message) {
			console.error(message + " => [" + error.Type + "]: " + error.Message + "\nCorrelation ID: " + error.CorrelationID);
			next != undefined && next(error);
		}
		else {
			console.error(message, error);
			next != undefined && next(error);
		}
	}

	/** Normalizes the HTML content */
	export function normalizeHtml(html?: string, removeTags?: boolean) {
		var wellHtml = isNotEmpty(html)
			? isTrue(removeTags)
				? html.replace(/<\/?[^>]+(>|$)/g, "")
				: html
			: "";
		return wellHtml != ""
			? wellHtml.replace(/\&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/\n/g, "<br/>")
			: "";
	}

	/** Removes tags from the HTML content */
	export function removeTags(html?: string) {
		return isNotEmpty(html)
			? html.replace(/<\/?[^>]+(>|$)/g, "")
			: "";
	}

	/** Gets all the available characters (0 and A-Z) */
	export function getChars() {
		var chars = new Array<string>("0");
		for (let code = 65; code < 91; code++) {
			chars.push(String.fromCharCode(code));
		}
		return chars;
	}

	/** Splits the string into the array of strings */
	export function toArray(obj: any, separator?: any): Array<string> | Array<any> | Array<{ name: string, value: any }> {
		if (isArray(obj)) {
			return obj as Array<any>;
		}
		else if (isNotEmpty(obj)) {
			let array = indexOf(obj as string, isNotEmpty(separator) ? separator : ",") > 0
				? (obj as string).split(separator != undefined ? separator : ",")
				: [obj as string];
			return new List(array).Select(element => isNotEmpty(element) ? element.trim() : "").ToArray();
		}
		else if (isObject(obj, true)) {
			if (isTrue(separator)) {
				let array = new Array<{ name: string, value: any}>();
				for (let name in obj) {
					array.push({ name: name, value: obj[name] });
				}
				return array;
			}
			else {
				let array = new Array<any>();
				for (let value of obj) {
					array.push(value);
				}
				return array;
			}
		}
		else {
			return [obj];
		}
	}

	/** Converts object to integer */
	export function toInt(value: any) {
		return isNotEmpty(value)
			? parseInt(value)
			: 0;
	}

	/** Converts the Vietnamese string to ANSI string */
	export function toANSI(input?: string): string {
		if (!isNotEmpty(input) || input.trim() == "") {
			return "";
		}

		var result = input.trim();

		result = result.replace(/\u00E1/g, "a");
		result = result.replace(/\u00C1/g, "A");
		result = result.replace(/\u00E0/g, "a");
		result = result.replace(/\u00C0/g, "A");
		result = result.replace(/\u1EA3/g, "a");
		result = result.replace(/\u1EA2/g, "A");
		result = result.replace(/\u00E3/g, "a");
		result = result.replace(/\u00C3/g, "A");
		result = result.replace(/\u1EA1/g, "a");
		result = result.replace(/\u1EA0/g, "A");
		//á Á

		result = result.replace(/\u0103/g, "a");
		result = result.replace(/\u0102/g, "A");
		result = result.replace(/\u1EAF/g, "a");
		result = result.replace(/\u1EAE/g, "A");
		result = result.replace(/\u1EB1/g, "a");
		result = result.replace(/\u1EB0/g, "A");
		result = result.replace(/\u1EB3/g, "a");
		result = result.replace(/\u1EB2/g, "A");
		result = result.replace(/\u1EB5/g, "a");
		result = result.replace(/\u1EB4/g, "A");
		result = result.replace(/\u1EB7/g, "a");
		result = result.replace(/\u1EB6/g, "A");
		//a A 

		result = result.replace(/\u00E2/g, "a");
		result = result.replace(/\u00C2/g, "A");
		result = result.replace(/\u1EA5/g, "a");
		result = result.replace(/\u1EA4/g, "A");
		result = result.replace(/\u1EA7/g, "a");
		result = result.replace(/\u1EA6/g, "A");
		result = result.replace(/\u1EA9/g, "a");
		result = result.replace(/\u1EA8/g, "A");
		result = result.replace(/\u1EAB/g, "a");
		result = result.replace(/\u1EAA/g, "A");
		result = result.replace(/\u1EAD/g, "a");
		result = result.replace(/\u1EAC/g, "A");
		// â Â 

		result = result.replace(/\u00E9/g, "e");
		result = result.replace(/\u00C9/g, "E");
		result = result.replace(/\u00E8/g, "e");
		result = result.replace(/\u00C8/g, "E");
		result = result.replace(/\u1EBB/g, "e");
		result = result.replace(/\u1EBA/g, "E");
		result = result.replace(/\u1EBD/g, "e");
		result = result.replace(/\u1EBC/g, "E");
		result = result.replace(/\u1EB9/g, "e");
		result = result.replace(/\u1EB8/g, "E");
		// é É 

		result = result.replace(/\u00EA/g, "e");
		result = result.replace(/\u00CA/g, "E");
		result = result.replace(/\u1EBF/g, "e");
		result = result.replace(/\u1EBE/g, "E");
		result = result.replace(/\u1EC1/g, "e");
		result = result.replace(/\u1EC0/g, "E");
		result = result.replace(/\u1EC3/g, "e");
		result = result.replace(/\u1EC2/g, "E");
		result = result.replace(/\u1EC5/g, "e");
		result = result.replace(/\u1EC4/g, "E");
		result = result.replace(/\u1EC7/g, "e");
		result = result.replace(/\u1EC6/g, "E");
		// ê Ê

		result = result.replace(/\u00ED/g, "i");
		result = result.replace(/\u00CD/g, "I");
		result = result.replace(/\u00EC/g, "i");
		result = result.replace(/\u00CC/g, "I");
		result = result.replace(/\u1EC9/g, "i");
		result = result.replace(/\u1EC8/g, "I");
		result = result.replace(/\u0129/g, "i");
		result = result.replace(/\u0128/g, "I");
		result = result.replace(/\u1ECB/g, "i");
		result = result.replace(/\u1ECA/g, "I");
		// í Í

		result = result.replace(/\u00F3/g, "o");
		result = result.replace(/\u00D3/g, "O");
		result = result.replace(/\u00F2/g, "o");
		result = result.replace(/\u00D2/g, "O");
		result = result.replace(/\u1ECF/g, "o");
		result = result.replace(/\u1ECE/g, "O");
		result = result.replace(/\u00F5/g, "o");
		result = result.replace(/\u00D5/g, "O");
		result = result.replace(/\u1ECD/g, "o");
		result = result.replace(/\u1ECC/g, "O");
		// ó Ó

		result = result.replace(/\u01A1/g, "o");
		result = result.replace(/\u01A0/g, "O");
		result = result.replace(/\u1EDB/g, "o");
		result = result.replace(/\u1EDA/g, "O");
		result = result.replace(/\u1EDD/g, "o");
		result = result.replace(/\u1EDC/g, "O");
		result = result.replace(/\u1EDF/g, "o");
		result = result.replace(/\u1EDE/g, "O");
		result = result.replace(/\u1EE1/g, "o");
		result = result.replace(/\u1EE0/g, "O");
		result = result.replace(/\u1EE3/g, "o");
		result = result.replace(/\u1EE2/g, "O");
		// o O

		result = result.replace(/\u00F4/g, "o");
		result = result.replace(/\u00D4/g, "O");
		result = result.replace(/\u1ED1/g, "o");
		result = result.replace(/\u1ED0/g, "O");
		result = result.replace(/\u1ED3/g, "o");
		result = result.replace(/\u1ED2/g, "O");
		result = result.replace(/\u1ED5/g, "o");
		result = result.replace(/\u1ED4/g, "O");
		result = result.replace(/\u1ED7/g, "o");
		result = result.replace(/\u1ED6/g, "O");
		result = result.replace(/\u1ED9/g, "o");
		result = result.replace(/\u1ED8/g, "O");
		// ô Ô

		result = result.replace(/\u00FA/g, "u");
		result = result.replace(/\u00DA/g, "U");
		result = result.replace(/\u00F9/g, "u");
		result = result.replace(/\u00D9/g, "U");
		result = result.replace(/\u1EE7/g, "u");
		result = result.replace(/\u1EE6/g, "U");
		result = result.replace(/\u0169/g, "u");
		result = result.replace(/\u0168/g, "U");
		result = result.replace(/\u1EE5/g, "u");
		result = result.replace(/\u1EE4/g, "U");
		// ú Ú

		result = result.replace(/\u01B0/g, "u");
		result = result.replace(/\u01AF/g, "U");
		result = result.replace(/\u1EE9/g, "u");
		result = result.replace(/\u1EE8/g, "U");
		result = result.replace(/\u1EEB/g, "u");
		result = result.replace(/\u1EEA/g, "U");
		result = result.replace(/\u1EED/g, "u");
		result = result.replace(/\u1EEC/g, "U");
		result = result.replace(/\u1EEF/g, "u");
		result = result.replace(/\u1EEE/g, "U");
		result = result.replace(/\u1EF1/g, "u");
		result = result.replace(/\u1EF0/g, "U");
		// u U

		result = result.replace(/\u00FD/g, "y");
		result = result.replace(/\u00DD/g, "Y");
		result = result.replace(/\u1EF3/g, "y");
		result = result.replace(/\u1EF2/g, "Y");
		result = result.replace(/\u1EF7/g, "y");
		result = result.replace(/\u1EF6/g, "Y");
		result = result.replace(/\u1EF9/g, "y");
		result = result.replace(/\u1EF8/g, "Y");
		result = result.replace(/\u1EF5/g, "y");
		result = result.replace(/\u1EF4/g, "Y");
		// ý Ý

		result = result.replace(/\u00D0/g, "D");
		result = result.replace(/\u0110/g, "D");
		result = result.replace(/\u0111/g, "d");
		// d Ð

		result = result.replace(/\s\s/g, " ");
		// double spaces

		return result.trim();
	}
}