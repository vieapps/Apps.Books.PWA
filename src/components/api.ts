import { ReflectiveInjector } from "@angular/core";
import { Http, Headers } from "@angular/http";
import { BrowserXhr, ConnectionBackend, XHRBackend, XSRFStrategy, CookieXSRFStrategy } from "@angular/http";
import { BaseRequestOptions, RequestOptions, BaseResponseOptions, ResponseOptions } from "@angular/http";
import { CompleterData, CompleterItem } from "ng2-completer";
import { List } from "linqts";
import * as Rx from "rxjs";

import { AppUtility } from "./utility";
import { AppCrypto } from "./crypto";
import { AppData } from "../models/data";

export namespace AppAPI {

	var httpInstance: Http = undefined;

	/** Sets the instance of the Angular Http service */
	export function setHttp(http: Http) {
		if (httpInstance == undefined && http != undefined && http != null) {
			httpInstance = http;
		}
	}

	/** Gets the instance of the Angular Http service */
	export function getHttp() {
		if (httpInstance == undefined) {
			httpInstance = ReflectiveInjector.resolveAndCreate([
				Http,
				BrowserXhr,
				{ provide: RequestOptions, useClass: BaseRequestOptions },
				{ provide: ResponseOptions, useClass: BaseResponseOptions },
				{ provide: ConnectionBackend, useClass: XHRBackend },
				{ provide: XSRFStrategy, useFactory: () => new CookieXSRFStrategy() }
			]).get(Http);
		}
		return httpInstance;
	}

	/**
		* Performs a request to APIs with 'GET' method
		* @param path Path of the end-point API's uri to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function Get(path: string, headers?: any) {
		return getHttp().get(AppData.Configuration.app.uris.apis + path, { headers: getHeaders(headers) });
	}

	/**
		* Performs a request to APIs with 'GET' method
		* @param path Path of the end-point API's uri to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function GetAsync(path: string, headers?: any) {
		return Get(path, headers).toPromise();
	}

	/**
		* Performs a request to APIs with 'POST' method
		* @param path Path of the end-point API's uri to perform the request
		* @param body The JSON object that contains the body to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function Post(path: string, body: any, headers?: any) {
		return getHttp().post(AppData.Configuration.app.uris.apis + path, JSON.stringify(body), { headers: getHeaders(headers, true) });
	}

	/**
		* Performs a request to APIs with 'POST' method
		* @param path Path of the end-point API's uri to perform the request
		* @param body The JSON object that contains the body to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function PostAsync(path: string, body: any, headers?: any) {
		return Post(path, body, headers).toPromise();
	}

	/**
		* Performs a request to APIs with 'PUT' method
		* @param path Path of the end-point API's uri to perform the request
		* @param body The JSON object that contains the body to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function Put(path: string, body: any, headers?: any) {
		return getHttp().put(AppData.Configuration.app.uris.apis + path, JSON.stringify(body), { headers: getHeaders(headers, true) });
	}

	/**
		* Performs a request to APIs with 'PUT' method
		* @param path Path of the end-point API's uri to perform the request
		* @param body The JSON object that contains the body to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function PutAsync(path: string, body: any, headers?: any) {
		return Put(path, body, headers).toPromise();
	}

	/**
		* Performs a request to APIs with 'DELETE' method
		* @param path Path of the end-point API's uri to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function Delete(path: string, headers?: any) {
		return getHttp().delete(AppData.Configuration.app.uris.apis + path, { headers: getHeaders(headers, false) });
	}

	/**
		* Performs a request to APIs with 'DELETE' method
		* @param path Path of the end-point API's uri to perform the request
		* @param headers Additional headers to perform the request
	*/
	export function DeleteAsync(path: string, headers?: any) {
		return Delete(path, headers).toPromise();
	}

	/** Gets the headers for making requests to APIs */
	export function getHeaders(additional?: any, addContentType?: boolean) {
		let headers = new Headers();
		let authHeaders = getAuthHeaders();
		for (let name in authHeaders) {
			headers.append(name, authHeaders[name]);
		}

		if (additional != undefined) {
			if (AppUtility.isArray(additional)) {
				new List<any>(additional).ForEach(header => {
					if (AppUtility.isObject(header, true) && AppUtility.isNotEmpty(header.name) && AppUtility.isNotEmpty(header.value)) {
						headers.append(header.name as string, header.value as string);
					}
				});
			}
			else if (AppUtility.isObject(additional, true)) {
				for (let name in additional) {
					headers.append(name, additional[name]);
				}
			}
		}

		if (addContentType) {
			headers.append("content-type", "application/json");
		}

		return headers;
	}

	/** Gets the authenticated headers (JSON) for making requests to APIs */
	export function getAuthHeaders(addToken = true, addAppInfo = true, addDeviceID = true): any {
		var headers = {};

		if (addToken
		&& AppUtility.isObject(AppData.Configuration.session.token, true)
		&& AppUtility.isObject(AppData.Configuration.session.keys, true)
		&& AppUtility.isNotEmpty(AppData.Configuration.session.keys.jwt)) {
			headers["x-app-token"] = AppCrypto.jwtEncode(AppData.Configuration.session.token, AppData.Configuration.session.keys.jwt);
		}

		if (addAppInfo) {
			headers["x-app-name"] = AppData.Configuration.app.name;
			headers["x-app-platform"] = AppData.Configuration.app.platform;
		}

		if (addDeviceID && AppUtility.isNotEmpty(AppData.Configuration.session.device)) {
			headers["x-device-id"] = AppData.Configuration.session.device;
		}

		return headers;
	}

	/** Gets the captcha headers (JSON) for making requests to APIs */
	export function getCaptchaHeaders(captcha: string): any {
		return {
			"x-captcha": "true",
			"x-captcha-registered": AppCrypto.aesEncrypt(AppData.Configuration.session.captcha.code),
			"x-captcha-input": AppCrypto.aesEncrypt(captcha)
		};
	}

	/** Completer custom searching services */
	export class CompleterCustomSearch extends Rx.Subject<CompleterItem[]> implements CompleterData {
    constructor(
			public buildRequest: (term: string) => string,
			public doConvert: (data: any) => CompleterItem[],
			public doCancel?: () => void			
		){
    	super();
    }

		private subscription: Rx.Subscription = undefined;

    public search(term: string) {
			this.subscription = Get(this.buildRequest(term))
				.map(response => {
					this.next(this.doConvert(response.json()));
				})
				.subscribe();
    }
 
    public cancel() {
			if (this.doCancel != undefined) {
				this.doCancel();
			}
			if (this.subscription) {
				this.subscription.unsubscribe();
			}
    }
	}

}