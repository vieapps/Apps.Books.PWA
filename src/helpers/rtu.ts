import * as Rx from "rxjs/Rx";

import { AppUtility } from "./utility";
import { AppCrypto } from "./crypto";
import { AppAPI } from "./api";
import { AppData } from "../models/data";

export namespace AppRTU {

	var status: string = null;
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
	  * Registers a handler for processing message when the real-time updater got a message from REST API
	  * @param type The string that presents type of a message
	  * @param handler The function to handler message when got a message from REST API
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
			let index = AppUtility.findIndex<any>(handlers[type], h => h.identity == identity);
			if (index != -1) {
				handlers[type].splice(index, 1);
			}
		}
	}

	/** Starts the real-time updater */
	export function start(onCompleted?: (info: any) => void, isRestart?: boolean) {
		// check
		if (typeof WebSocket === undefined) {
			console.warn("[RTU]: Your browser is outdated, its requires a modern browser that supports WebSocket (like Chrome, Safari, Firefox, Microsoft Edge/IE 10/11, ...)");
			onCompleted != undefined && window.setTimeout(() => {
				onCompleted({ r: receiver, s: sender });
			}, status == null || status == "ready" ? 13 : 567);
			return;
		}
		else if (receiver != null) {
			onCompleted != undefined && window.setTimeout(() => {
				onCompleted({ r: receiver, s: sender });
			}, status == null || status == "ready" ? 13 : 567);
			return;
		}

		// initialize
		status = "initializing";
		uri = AppData.Configuration.api.replace("http://", "ws://").replace("https://", "wss://")
			+ "rtu/" + AppCrypto.urlEncode(Math.random() + "").toLowerCase()
			+ "?x-request=" + AppUtility.getBase64UrlParam(AppAPI.getAuthHeaders())
			+ (AppUtility.isTrue(isRestart) ? "&x-restart=" : "");

		// create new instance of receiver & assign event handlers
		receiver = new WebSocket(uri);

		receiver.onopen = (event) => {
			status = "ready";
			console.info("[RTU]: The updater is ready...");
		};

		receiver.onclose = (event) => {
			status = "close";
			if (AppUtility.isNotEmpty(uri)) {
				restart();
			}
		};

		receiver.onerror = (event) => {
			status = "error";
			console.warn("[RTU]: Got an error", event);
		};

		receiver.onmessage = (event) => {
			process(JSON.parse(event.data));
		};

		// create new instance of sender
		sender = new WebSocket(uri + "&x-mode=" + AppData.Configuration.session.id);
		
		// callback when done
		onCompleted != undefined && window.setTimeout(() => {
			onCompleted({ r: receiver, s: sender });
		}, status == "ready" ? 13 : 567);
	}

	/** Restarts the real-time updater */
	export function restart(reason?: string, defer?: number) {
		console.warn("[RTU]: " + (reason || "Re-start because the WebSocket connection is broken"));
		window.setTimeout(() => {
			if (receiver != null) {
				receiver.close();
				receiver = null;
			}

			if (sender != null) {
				sender.close();
				sender = null;
			}

			status = "restarting";
			console.info("[RTU]: Re-starting...");

			start(() => {
				console.info("[RTU]: The updater is re-started successful...", AppUtility.isDebug() ? { r: receiver, s: sender } : "");
			}, true);
		}, defer || 123);
	}

	/** Stops the real-time updater */
	export function stop(onCompleted?: (data: any) => void) {
		if (receiver != null) {
			receiver.close();
			receiver = null;
		}

		if (sender != null) {
			sender.close();
			sender = null;
		}

		uri = null;
		status = "closed";

		onCompleted != undefined && onCompleted({ r: receiver, s: sender });
	}

	/** Gets the ready state of the real-time updater for receiving messages */
	export function isReceiverReady() {
		return receiver != null && status == "ready";
	}

	/** Gets the ready state of the real-time updater for sending messages */
	export function isSenderReady() {
		return sender != null && status == "ready";
	}

	/** Calls a service to receive update message via real-time updater */
	export function call(serviceName: string, objectName: string, verb?: string, query?: any, header?: any, body?: string, extra?: any, onNext?: () => void): void {
		verb = verb || "GET"
		if (isSenderReady()) {
			sender.send(JSON.stringify({
				ServiceName: serviceName,
				ObjectName: objectName,
				Verb: verb,
				Query: query,
				Header: header,
				Body: body,
				Extra: extra
			}));
			onNext != undefined && onNext();
		}
		else {
			let path = "";
			if (AppUtility.isObject(query, true)) {
				for (let name in query) {
					path += name + "=" + encodeURIComponent(query[name]);
				}
			}
			path = serviceName + "/" + objectName + (path != "" ? "?" + path : "");

			if (verb == "POST") {
				AppAPI.Post(path, body, header);
			}
			else if (verb == "PUT") {
				AppAPI.Put(path, body, header);
			}
			else if (verb == "DELETE") {
				AppAPI.Delete(path, header);
			}
			else {
				AppAPI.Get(path, header);
			}

			onNext != undefined && onNext();
		}
	}
	
	/** Parses information from the message type */
	export function parse(type: string): { ServiceName: string, ObjectName: string } {
		var pos = AppUtility.indexOf(type, "#");
		return {
			ServiceName: pos > 0 ? type.substring(0, pos) : type,
			ObjectName:  pos > 0 ? type.substring(pos + 1) : ""
		};
	}

	/** Process the message */
	export function process(message: any) {
		var info = parse(message.Type);
		AppUtility.isDebug() && console.info("[RTU]: Got a message " + (info.ObjectName != "" ? "(" + info.ObjectName + ")" : ""), message);
		if (info.ServiceName == "Ping") {
			console.log("[RTU]: ping (" + (new Date()).toJSON() + ")", AppUtility.isDebug() ? message.Data : "");
		}
		else if (AppUtility.isNotEmpty(message.ExcludedDeviceID) && message.ExcludedDeviceID == AppData.Configuration.session.device) {
			AppUtility.isDebug() && console.info("[RTU]: The device is excluded");
		}
		else {
			subject.next({ "type": info.ServiceName, "message": message });
		}
	}

}