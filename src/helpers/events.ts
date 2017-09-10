import * as Rx from "rxjs/Rx";

import { AppUtility } from "./utility";

export namespace AppEvents {

	var handlers: any = {};

	var subject = new Rx.Subject<{ event: string, args: any }>();
	var observable = Rx.Observable.from(subject);
	observable.subscribe(
		({ event, args }) => {
			if (handlers[event]) {
				for (let handler of handlers[event]) {
					handler.func({ "event": event, "args": args });
				}
			}
		}
	);

	/**
	  * Registers a handler for processing data when a specified event has been raised/broadcasted
	  * @param event The string that presents the name of an event
	  * @param handler The function to handler data when an event was raised
	  * @param identity The string that presents identity of the handler for unregistering later
	*/
	export function on(event: string, handler: (info: any) => void, identity?: string) {
		if (AppUtility.isNotEmpty(event) && handler != undefined) {
			handlers[event] = handlers[event] || [];
			handlers[event].push({ func: handler, identity: AppUtility.isNotEmpty(identity) ? identity : "" });
		}
	}

	/**
	  * Unregisters a handler
	  * @param event The string that presents the name of an event
	  * @param identity The string that presents the identity of the handler for unregistering
	*/
	export function off(event: string, identity: string) {
		if (AppUtility.isNotEmpty(event) && AppUtility.isNotEmpty(identity) && handlers[event]) {
			let index = AppUtility.find<any>(handlers[event], h => h.identity == identity);
			if (index != -1) {
				handlers[event].splice(index, 1);
			}
		}
	}

	/**
	  * Broadcasts an event message through the app scope
	  * @param event The string that presents the name of an event
	  * @param args The JSON object that presents the arguments of an event
	*/
	export function broadcast(event: string, args?: any) {
		subject.next({ event, args });
	}

}