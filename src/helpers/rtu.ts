import { Response } from "@angular/http";
import * as Rx from "rxjs/Rx";

import { AppUtility } from "./utility";
import { AppCrypto } from "./crypto";
import { AppAPI } from "./api";
import { AppData } from "../models/data";

export namespace AppRTU {

	var status: { receiver: string, sender: string } = { receiver: "initializing", sender: "initializing" };
	var uri: string = null;
	var receiver: any = null;
	var sender: any = null;
	var handlers: any = {};

	var subject = new Rx.Subject<{ type: string, message: any }>();
	var observable = Rx.Observable.from(subject);
	observable.subscribe(
		({ type, message }) => {
			if (handlers[type]) {
				for (let handler of handlers[type]) {
					handler.func(message);
				}
			}
			else {
				AppUtility.isDebug() && console.warn("[RTU]: Got a message but no suitable handler is found", "<" + type + ">", message);
			}
		},
		(error: any) => {
			console.error("[RTU]: Got an error", error);
		}
	);

	/**
	  * Registers a handler for processing when got a message from APIs
	  * @param type The string that presents type of a message
	  * @param handler The function for processing when got a message from APIs
	  * @param identity The string that presents identity of the handler for unregistering later
	*/
	export function register(type: string, handler: (message: any) => void, identity?: string) {
		if (AppUtility.isNotEmpty(type) && handler != undefined) {
			handlers[type] = handlers[type] || [];
			handlers[type].push({ func: handler, identity: AppUtility.isNotEmpty(identity) ? identity : "" });
		}
	}

	/**
	  * Unregisters a handler
	  * @param type The string that presents type of a message
	  * @param identity The string that presents identity of the handler for unregistering
	*/
	export function unregister(type: string, identity: string) {
		if (AppUtility.isNotEmpty(type) && AppUtility.isNotEmpty(identity) && handlers[type]) {
			let index = AppUtility.find<any>(handlers[type], h => h.identity == identity);
			if (index != -1) {
				handlers[type].splice(index, 1);
			}
		}
	}

	/** Starts */
	export function start(onCompleted?: (info?: any) => void, isRestart?: boolean) {
		// check
		if (typeof WebSocket === undefined) {
			console.warn("[RTU]: Your browser is outdated, its requires a modern browser that supports WebSocket (like Chrome, Safari, Firefox, Microsoft Edge/IE 10/11, ...)");
			onCompleted != undefined && AppUtility.setTimeout(() => {
				onCompleted({ r: receiver, s: sender });
			}, status == null || status.receiver == "ready" ? 13 : 567);
			return;
		}
		else if (receiver != null) {
			onCompleted != undefined && AppUtility.setTimeout(() => {
				onCompleted({ r: receiver, s: sender });
			}, status == null || status.receiver == "ready" ? 13 : 567);
			return;
		}

		// initialize
		status = { receiver: "initializing", sender: "initializing" };
		uri = AppData.Configuration.app.uris.apis.replace("http://", "ws://").replace("https://", "wss://")
			+ "rtu/" + AppCrypto.urlEncode(Math.random() + "").toLowerCase()
			+ "?x-request=" + AppUtility.getBase64UrlParam(AppAPI.getAuthHeaders())
			+ (AppUtility.isTrue(isRestart) ? "&x-restart=" : "");

		// receiver
		receiver = new WebSocket(uri);

		receiver.onopen = (event) => {
			status.receiver = "ready";
			AppUtility.isDebug() && console.info("[RTU]: Receiver is opened...");
		};

		receiver.onclose = (event) => {
			status.receiver = "close";
			AppUtility.isDebug() && console.info("[RTU]: Receiver is closed...");
			AppUtility.isNotEmpty(uri) && restart();
		};

		receiver.onerror = (event) => {
			status.receiver = "error";
			AppUtility.isDebug() && console.warn("[RTU]: Receiver got an error", event);
		};

		receiver.onmessage = (event) => {
			let message = JSON.parse(event.data);
			if (AppUtility.isNotEmpty(message.Type) && message.Type == "Error" && AppUtility.isGotSecurityException(message.Error)) {
				console.info("[RTU]: Stop when receiver got a security issue");
				stop();
			}
			else {
				process(message);
			}
		};

		// sender
		sender = new WebSocket(uri + "&x-receiver=" + AppData.Configuration.session.id);

		sender.onopen = (event) => {
			status.sender = "ready";
			AppUtility.isDebug() && console.info("[RTU]: Sender is opened...");
		};

		sender.onclose = (event) => {
			status.sender = "close";
			AppUtility.isDebug() && console.info("[RTU]: Sender is closed...");
			AppUtility.isNotEmpty(uri) && status.sender != "restarting" && restart();
		};

		sender.onerror = (event) => {
			status.sender = "error";
			AppUtility.isDebug() && console.warn("[RTU]: Sender got an error", event);
		};

		sender.onmessage = (event) => {
			let message = JSON.parse(event.data);
			if (AppUtility.isNotEmpty(message.Type) && message.Type == "Error" && AppUtility.isGotSecurityException(message.Error)) {
				console.info("[RTU]: Stop when sender got a security issue");
				stop();
			}
		};
		
		// callback when done
		onCompleted != undefined && AppUtility.setTimeout(() => {
			onCompleted({ r: receiver, s: sender });
		}, status.receiver == "ready" && status.sender == "ready" ? 13 : 567);
	}

	/** Restarts */
	export function restart(reason?: string, defer?: number) {
		status.receiver = "restarting";
		status.sender = "restarting";
		console.warn("[RTU]: " + (reason || "Re-start because the WebSocket connection is broken"));

		window.setTimeout(() => {
			console.info("[RTU]: Re-starting...");

			if (receiver != null) {
				receiver.close();
				receiver = null;
			}

			if (sender != null) {
				sender.close();
				sender = null;
			}

			start(() => {
				console.info("[RTU]: The updater is re-started successful...", AppUtility.isDebug() ? { r: receiver, s: sender } : "");
			}, true);
		}, defer || 123);
	}

	/** Stops */
	export function stop(onCompleted?: (data?: any) => void) {
		uri = null;

		status.receiver = "closed";
		if (receiver != null) {
			receiver.close();
			receiver = null;
		}

		status.sender = "closed";
		if (sender != null) {
			sender.close();
			sender = null;
		}

		onCompleted != undefined && onCompleted({ r: receiver, s: sender });
	}

	/** Gets the ready state */
	export function isReady() {
		return receiver != null && status.receiver == "ready" && sender != null && status.sender == "ready";
	}

	/** Sends the request to a service */
	export function send(request: any, rtuNext?: () => void, ajaxNext?: (observable?: Rx.Observable<Response>) => void): void {
		if (!AppUtility.isObject(request, true)) {
			return;
		}
		else if (isReady()) {
			sender.send(JSON.stringify(request));
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
	export function parse(type: string): { ServiceName: string, ObjectName: string } {
		var pos = AppUtility.indexOf(type, "#");
		return {
			ServiceName: pos > 0 ? type.substring(0, pos) : type,
			ObjectName:  pos > 0 ? type.substring(pos + 1) : ""
		};
	}

	/** Process the message */
	function process(message: any) {
		let info = parse(message.Type);
		AppUtility.isDebug() && console.info("[RTU]: Got a message " + (info.ObjectName != "" ? "(" + info.ObjectName + ")" : ""), message);
		
		if (info.ServiceName == "Knock") {
			AppUtility.isDebug() && console.log("[RTU]: Knock, Knock, Knock ... => Yes, I'm right here (" + (new Date()).toJSON() + ")");
		}
		else if (info.ServiceName == "OnlineStatus") {
			AppUtility.isDebug() && console.log("[RTU]: Got a flag to update status & run scheduler");
			call("users", "status");
			if (handlers["Scheduler"]) {
				subject.next({ "type": "Scheduler", "message": message });
			}
		}
		else if (AppUtility.isNotEmpty(message.ExcludedDeviceID) && message.ExcludedDeviceID == AppData.Configuration.session.device) {
			AppUtility.isDebug() && console.warn("[RTU]: The device is excluded", AppData.Configuration.session.device);
		}
		else {
			subject.next({ "type": info.ServiceName, "message": message });
		}
	}

}