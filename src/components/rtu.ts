import { Response } from "@angular/http";
import * as Rx from "rxjs";

import { AppUtility } from "./utility";
import { AppCrypto } from "./crypto";
import { AppAPI } from "./api";
import { AppData } from "../models/data";

export namespace AppRTU {

	var status = "initializing";
	var uri: string = null;
	var processor: any = null;

	var serviceScopeHandlers: any = {};
	var objectScopeHandlers: any = {};

	var serviceScopeSubject = new Rx.Subject<{ service: string, message: any }>();
	Rx.Observable.from(serviceScopeSubject).subscribe(
		({ service, message }) => {
			if (serviceScopeHandlers[service]) {
				for (let handler of serviceScopeHandlers[service]) {
					handler.func(message);
				}
			}
			else {
				AppUtility.isDebug() && console.warn("[RTU]: Got a message but no suitable handler is found (service scope)", "<" + service + ">", message);
			}
		},
		(error: any) => {
			console.error("[RTU]: Got an error", error);
		}
	);

	var objectScopeSubject = new Rx.Subject<{ service: string, object: string, message: any }>();
	Rx.Observable.from(objectScopeSubject).subscribe(
		({ service, object, message }) => {
			let type = service + "#" + object;
			if (serviceScopeHandlers[type]) {
				for (let handler of serviceScopeHandlers[type]) {
					handler.func(message);
				}
			}
			else {
				AppUtility.isDebug() && console.warn("[RTU]: Got a message but no suitable handler is found (object scope)", "<" + type + ">", message);
			}
		},
		(error: any) => {
			console.error("[RTU]: Got an error", error);
		}
	);

	/**
	  * Registers a handler for processing RTU messages at scope of a service
	  * @param service The string that presents name of a service
	  * @param handler The function for processing when got a message from APIs
	  * @param identity The string that presents identity of the handler for unregistering later
	*/
	export function registerAsServiceScopeProcessor(service: string, handler: (message: any) => void, identity?: string) {
		if (AppUtility.isNotEmpty(service) && handler != undefined) {
			serviceScopeHandlers[service] = serviceScopeHandlers[service] || [];
			serviceScopeHandlers[service].push({ func: handler, identity: AppUtility.isNotEmpty(identity) ? identity : "" });
		}
	}

	/**
	  * Registers a handler for processing RTU messages at scope of a service
	  * @param service The string that presents name of a service
	  * @param object The string that presents name of an object in the service
	  * @param handler The function for processing when got a message from APIs
	  * @param identity The string that presents identity of the handler for unregistering later
	*/
	export function registerAsObjectScopeProcessor(service: string, object: string, handler: (message: any) => void, identity?: string) {
		if (AppUtility.isNotEmpty(service) && handler != undefined) {
			let type = service + "#" + (object || "");
			serviceScopeHandlers[type] = serviceScopeHandlers[type] || [];
			serviceScopeHandlers[type].push({ func: handler, identity: AppUtility.isNotEmpty(identity) ? identity : "" });
		}
	}

	/**
	  * Unregisters a handler
	  * @param identity The string that presents identity of the handler for unregistering
	  * @param service The string that presents type of a message
	  * @param object The string that presents name of an object in the service
	*/
	export function unregister(identity: string, service: string, object?: string) {		
		if (AppUtility.isNotEmpty(identity) && AppUtility.isNotEmpty(service)) {
			if (serviceScopeHandlers[service]) {
				let index = AppUtility.find<any>(serviceScopeHandlers[service], handler => identity == handler.identity);
				if (index != -1) {
					serviceScopeHandlers[service].splice(index, 1);
				}
			}
			if (AppUtility.isNotEmpty(object)) {
				let type = service + "#" + object;
				if (serviceScopeHandlers[type]) {
					let index = AppUtility.find<any>(objectScopeHandlers[type], handler => identity == handler.identity);
					if (index != -1) {
						objectScopeHandlers[type].splice(index, 1);
					}
				}
			}
		}
	}

	/** Starts */
	export function start(onCompleted?: (info?: any) => void, isRestart?: boolean) {
		// check
		if (typeof WebSocket === undefined) {
			console.warn("[RTU]: Your browser is outdated, its requires a modern browser that supports WebSocket (like Chrome, Safari, Firefox, Microsoft Edge/IE 10/11, ...)");
			onCompleted != undefined && AppUtility.setTimeout(() => {
				onCompleted(processor);
			}, status == null || status == "ready" ? 13 : 567);
			return;
		}
		else if (processor != null) {
			onCompleted != undefined && AppUtility.setTimeout(() => {
				onCompleted(processor);
			}, status == null || status == "ready" ? 13 : 567);
			return;
		}

		// initialize
		status = "initializing";
		uri = AppData.Configuration.app.uris.apis.replace("http://", "ws://").replace("https://", "wss://")
			+ "rtu/" + AppCrypto.urlEncode(Math.random() + "").toLowerCase()
			+ "?x-request=" + AppUtility.getBase64UrlParam(AppAPI.getAuthHeaders())
			+ (AppUtility.isTrue(isRestart) ? "&x-restart=" : "");

		// receiver
		processor = new WebSocket(uri);

		processor.onopen = (event) => {
			status = "ready";
			AppUtility.isDebug() && console.info("[RTU]: Updater is opened...");
		};

		processor.onclose = (event) => {
			status = "close";
			AppUtility.isDebug() && console.info("[RTU]: Updater is closed...");
			AppUtility.isNotEmpty(uri) && restart();
		};

		processor.onerror = (event) => {
			status = "error";
			AppUtility.isDebug() && console.warn("[RTU]: Updater got an error", event);
		};

		processor.onmessage = (event) => {
			let message = JSON.parse(event.data);
			if (AppUtility.isNotEmpty(message.Type) && message.Type == "Error" && AppUtility.isGotSecurityException(message.Error)) {
				console.info("[RTU]: Stop when updater got a security issue");
				stop();
			}
			else {
				process(message);
			}
		};

		// callback when done
		onCompleted != undefined && AppUtility.setTimeout(() => {
			onCompleted(processor);
		}, status == "ready" && status == "ready" ? 13 : 567);
	}

	/** Restarts */
	export function restart(reason?: string, defer?: number) {
		status = "restarting";
		console.warn("[RTU]: " + (reason || "Re-start because the WebSocket connection is broken"));

		window.setTimeout(() => {
			console.info("[RTU]: Re-starting...");

			if (processor != null) {
				processor.close();
				processor = null;
			}

			start(() => {
				console.info("[RTU]: The updater is re-started successful...", AppUtility.isDebug() ? processor : "");
			}, true);
		}, defer || 123);
	}

	/** Stops */
	export function stop(onCompleted?: (data?: any) => void) {
		uri = null;

		status = "closed";
		if (processor != null) {
			processor.close();
			processor = null;
		}

		onCompleted != undefined && onCompleted(processor);
	}

	/** Gets the ready state */
	export function isReady() {
		return processor != null && status == "ready";
	}

	/** Sends the request to a service */
	export function send(request: any, rtuNext?: () => void, ajaxNext?: (observable?: Rx.Observable<Response>) => void): void {
		if (!AppUtility.isObject(request, true)) {
			return;
		}
		else if (isReady()) {
			processor.send(JSON.stringify(request));
			rtuNext != undefined && rtuNext();
		}
		else {
			let path = request.ServiceName + "/" + request.ObjectName;
			if (AppUtility.isObject(request.Query, true)) {
				path += "?"
				for (let name in request.Query) {
					path += name + "=" + encodeURIComponent(request.Query[name]);
				}
			}
			
			let observable: Rx.Observable<Response> = null;
			if (request.Verb == "POST") {
				observable = AppAPI.Post(path, request.Body, request.Header);
			}
			else if (request.Verb == "PUT") {
				observable = AppAPI.Put(path, request.Body, request.Header);
			}
			else if (request.Verb == "DELETE") {
				observable = AppAPI.Delete(path, request.Header);
			}
			else {
				observable = AppAPI.Get(path, request.Header);
			}

			ajaxNext != undefined && ajaxNext(observable);
		}
	}
		
	/** Calls a service */
	export function call(serviceName: string, objectName: string, verb?: string, query?: any, header?: any, body?: string, extra?: any, rtuNext?: () => void, ajaxNext?: (observable?: Rx.Observable<Response>) => void): void {
		send({
			ServiceName: serviceName,
			ObjectName: objectName,
			Verb: verb || "GET",
			Query: query,
			Header: header,
			Body: body,
			Extra: extra
		}, rtuNext, ajaxNext);
	}
		
	/** Parses the type of the message */
	export function parse(type: string): { Service: string, Object: string, Event: string } {
		let pos = AppUtility.indexOf(type, "#");
		let service = pos > 0 ? type.substring(0, pos) : type;
		let object = "", event = "";
		if (pos > 0) {
			object = type.substring(pos + 1);
			pos = AppUtility.indexOf(object, "#");
			if (pos > 0) {
				event = object.substring(pos + 1);
				object = object.substring(0, pos);
			}
		}
		return {
			Service: service,
			Object:  object,
			Event: event
		};
	}

	function process(message: any) {
		let info = parse(message.Type);
		AppUtility.isDebug() && console.info("[RTU]: Got a message", message);
		
		if (info.Service == "Pong") {
			AppUtility.isDebug() && console.log("[RTU]: Got a heartbeat");
		}
		else if (info.Service == "Knock") {
			AppUtility.isDebug() && console.log("[RTU]: Knock, Knock, Knock ... => Yes, I'm right here (" + (new Date()).toJSON() + ")");
		}
		else if (info.Service == "OnlineStatus") {
			AppUtility.isDebug() && console.log("[RTU]: Got a flag to update status & run scheduler");
			call("users", "status", "GET");
			call("rtu", "session", "PING")
			if (serviceScopeHandlers["Scheduler"]) {
				serviceScopeSubject.next({ "service": "Scheduler", "message": message });
			}
		}
		else if (AppUtility.isNotEmpty(message.ExcludedDeviceID) && message.ExcludedDeviceID == AppData.Configuration.session.device) {
			AppUtility.isDebug() && console.warn("[RTU]: The device is excluded", AppData.Configuration.session.device);
		}
		else {
			serviceScopeSubject.next({ "service": info.Service, "message": message });
			objectScopeSubject.next({ "service": info.Service, "object": info.Object, "message": message });
		}
	}

}