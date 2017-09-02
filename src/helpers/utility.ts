import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts";

import { AppCrypto } from "./crypto";
import { AppData } from "../models/data";

export namespace AppUtility {
	/** Checks to see the object is boolean and equals to true */
	export function isTrue(obj?: any) {
		return typeof obj == "boolean" && obj === true;
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
			? new List(securityExceptions)
				.Where((e) => {
					return e == error.Type
				})
				.FirstOrDefault() != undefined
			: false;
	}

	const securityExceptions: Array<string> = [
		"UnauthorizedException", "AccessDeniedException",
		"SessionNotFoundException", "InvalidSessionException", "SessionExpiredException", "SessionInformationRequiredException",
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
		return AppData.Configuration.app.platform == "iOS";
	}

	/** Gets the state that determines the app is running on Windows Phone */
	export function isWindowsPhoneOS() {
		return AppData.Configuration.app.platform == "Windows Phone";
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
			var data = isNotEmpty(source)
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
		if (beRemoved != undefined && beRemoved.length > 0) {
			for (let attribute of beRemoved) {
				delete obj[attribute];
			}
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
		if (isObject(control, true) && typeof control.setFocus == "function") {
			window.setTimeout(() => {
				control.setFocus();
				if (isNotNull(keyboard) && isNativeApp()) {
					keyboard.show();
				}
			}, defer != undefined ? defer : isNativeApp() ? 567 : 234);
		}
	}

	/** Gets the position of the sub-string in the string */
	export function indexOf(str: string, substr: string, start?: number) {
		return isNotEmpty(str) && isNotEmpty(substr)
			? str.indexOf(substr, start)
			: -1;
	}

	/** Finds the index of an item in the sequence base on a predicate */
	export function findIndex<T>(items: Array<T>, predicate: (item: T) => boolean): number {
		for (let index = 0; index < items.length; index++) {
			if (predicate(items[index])) {
				return index;
			}
		}
		return -1;
	}

	/** Gets the time-stamp */
	export function getTimestamp() {
		return Math.round(+new Date() / 1000);
	}

	/** Splits the string into the array of strings */
	export function toArray(obj: any, seperator?: string): Array<string> | Array<any> {
		if (isArray(obj)) {
			return obj as Array<any>;
		}
		else if (isNotEmpty(obj)) {
			let array = indexOf(obj as string, seperator != undefined ? seperator : ",") > 0
				? (obj as string).split(seperator != undefined ? seperator : ",")
				: [obj as string];

			return new List(array)
				.Select((i) => {
					return isNotEmpty(i) ? i.trim() : ""
				})
				.ToArray();
		}
		else if (isObject(obj, true)) {
			let array = new Array<any>();
			for (let i of obj) {
				array.push(i);
			}
			return array;
		}
		else {
			return [obj];
		}
	}

	/** Gets the cover image of a book */
	export function getCoverImage(cover?: string, noCover?: string) {
		return isNotEmpty(cover)
			? cover
			: isNotEmpty(noCover)
				? noCover
				: AppData.Configuration.api + "media-files/no/cover/image.png";
	}

	/** Gets the avatar image (using services of Gravatar.com) */
	export function getGravatarImage(email?: string, noAvatar?: string) {
		noAvatar = isNotEmpty(noAvatar)
			? noAvatar
			: AppData.Configuration.api + "avatar/" + AppData.Configuration.app.host + "-no-avatar.png";
		return isNotEmpty(email)
			? "https://secure.gravatar.com/avatar/" + AppCrypto.md5(email.toLowerCase().trim()) + "?s=300&d=" + encodeURIComponent(noAvatar)
			: noAvatar;
	}

	/** Gets the avatar image */
	export function getAvatarImage(info?: any, noAvatar?: string) {
		var avatar: string = isObject(info, true) && isNotEmpty(info.Avatar)
			? info.Avatar
			: isObject(info, true) && isNotEmpty(info.Gravatar)
				? info.Gravatar
				: "";
		if (avatar == "" && isObject(info, true)) {
			avatar = getGravatarImage(isObject(info.Contact, true) ? info.Contact.Email : info.Email, noAvatar);
		}
		return avatar;
	}

	/** Gets the query from JSON */
	export function getQuery(json: any): string {
		try {
			var query = "";
			if (isObject(json, true)) {
				for(var name in json) {
					query += (query != "" ? "&" : "")
						+ name + "=" + encodeURIComponent(json[name]);
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

	/** Gets the current uri */
	export function getUri() {
		return indexOf(window.location.hostname, ".") < 0
			? window.location.href
			: window.location.protocol + "//" + window.location.hostname + "/";
	}

	/** Gets the CSS classes for working with input control */
	export function getInputCss() {
		return "text-input "
			+ (isAppleOS()
				? "text-input-ios"
				: isWindowsPhoneOS()
					? "text-input-wp"
					: "text-input-md");
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
			list = list.Where((o) => {
				return excluded != o.ID
			});
		}
		list = list.Select((o) => {
			let i = clone(o);
			if (isFalse(dontAddRandomScore)) {
				i[nameOfRandomScore] = Math.random();
			}
			return i;
		});
		if (isFalse(dontAddRandomScore)) {
			list = list.OrderByDescending((i) => {
				return i[nameOfRandomScore]
			});
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
			new List<any>(
				AppData.Configuration.meta.provinces[country]
					? AppData.Configuration.meta.provinces[country].provinces
					: []
				).ForEach((p) => {
					new List<any>(p.counties).ForEach((c) => {
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

		info.current =
			address.county == "" && address.province == "" && address.country == ""
			? undefined
			: new List(info.addresses).FirstOrDefault(a => a.county == address.county && a.province == address.province && a.country == address.country);

		return info;
	}

	/** Opens Google Maps by address or location via query */
	export function openGoogleMaps(info: string) {
		window.open("https://www.google.com/maps?q=" + encodeURIComponent(info));
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