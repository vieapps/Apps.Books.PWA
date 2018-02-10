import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { List } from "linqts";

import { AppUtility } from "../components/utility";
import { AppAPI } from "../components/api";
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
	search(request: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		var pagination = AppData.Paginations.get(request, "A");
		if (pagination != null && pagination.PageNumber >= pagination.TotalPages) {
			onNext != undefined && onNext();
			return;
		}

		request.Pagination.PageNumber++;
		let path = "users/profile/search"
			+ "?x-request=" + AppUtility.getBase64UrlParam(request)
			+ "&related-service=books"
			+ "&language=" + AppData.Configuration.session.account.profile.Language;
		let searcher = AppAPI.Get(path);
		
		if (!onNext) {
			return searcher;
		}

		searcher.map(response => response.json()).subscribe(
			(data: any) => {
				AppData.Paginations.set(data, "A");
				new List<any>(data.Objects).ForEach(a => AppModels.Account.update(a));
				onNext(data);
			},
			(error: any) => {
				AppUtility.showError("[Accounts]: Error occurred while searching accounts", error.json(), onError);
			}
		);
	}

	async fetchAsync(accountIDs: Array<string>, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		var ids = new List(accountIDs).Except(new List(AppData.Accounts.keys())).ToArray();
		if (ids.length < 1) {
			onNext != undefined && onNext();
			return;
		}

		try {
			let path = "users/profile/fetch"
				+ "?x-request=" + AppUtility.getBase64UrlParam({ IDs: ids })
				+ "&related-service=books"
				+ "&language=" + AppData.Configuration.session.account.profile.Language;
			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			new List<any>(data.Objects).ForEach(a => AppModels.Account.update(a));
			onNext != undefined && onNext(data);
		}
		catch (error) {
			AppUtility.showError("[Accounts]: Error occurred while searching accounts", error.json(), onError);
		}
	}

}