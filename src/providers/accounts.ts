import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { List } from "linqts";
import "rxjs/add/operator/map";

import { AppUtility } from "../helpers/utility";
import { AppAPI } from "../helpers/api";
import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

@Injectable()
export class AccountsService {

	constructor(public http: Http) {
		AppAPI.setHttp(this.http);
	}

	/** Checks to see the user is online or not */
	isOnline(id?: string) {
		var account = AppUtility.isNotEmpty(id)
			? AppData.Accounts.getValue(id)
			: undefined;
		return account != undefined && account.IsOnline;
	}

	/** Performs a request to REST API to search account profiles */
	search(request: any, onNext?: (d?: any) => void, onError?: (e: any) => void) {
		var pagination = AppData.Paginations.get(request, "A");
		if (pagination != null && pagination.PageNumber >= pagination.TotalPages) {
			onNext != undefined && onNext();
			return;
		}

		request.Pagination.PageNumber++;
		let path = "users/profile/search"
			+ "?x-request=" + AppUtility.getBase64UrlParam(request)
			+ "&related-service=books"
			+ "&language=vi-VN";
		let searcher = AppAPI.Get(path);
		
		if (onNext == undefined) {
			return searcher;
		}

		searcher.map(response => response.json()).subscribe(
			(data: any) => {
				if (!AppUtility.isObject(data, true)) {
					onError != undefined && onError(data);
				}
				else if (data.Status == "OK") {
					AppData.Paginations.set(data.Data, "A");
					new List<any>(data.Data.Objects).ForEach(a => AppModels.Account.update(a));
					onNext != undefined && onNext(data);
				}
				else {
					console.error("[Accounts]: Error occurred while searching accounts");
					AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
					onError != undefined && onError(data);
				}
			},
			(error: any) => {
				console.error("[Accounts]: Error occurred while searching accounts", error);
				onError != undefined && onError(error);
			}
		);
	}

	async fetchAsync(accountIDs: Array<string>, onNext?: (d?: any) => void, onError?: (e: any) => void) {
		var ids = new List(accountIDs).Except(new List(AppData.Accounts.keys())).ToArray();
		if (ids.length < 1) {
			onNext != undefined && onNext();
			return;
		}

		try {
			let path = "users/profile/fetch"
				+ "?x-request=" + AppUtility.getBase64UrlParam({ IDs: ids })
				+ "&related-service=books"
				+ "&language=vi-VN";
			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			if (data.Status == "OK") {
				new List<any>(data.Data.Objects).ForEach(a => AppModels.Account.update(a));
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Accounts]: Error occurred while searching accounts");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
		}
		}
		catch (e) {
			console.error("[Accounts]: Error occurred while searching accounts", e);
			onError != undefined && onError(e);
		}
	}

}