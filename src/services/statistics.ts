import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { Storage } from "@ionic/storage";
import { List } from "linqts";
import "rxjs/add/operator/toPromise";

import { AppUtility } from "../components/utility";
import { AppEvents } from "../components/events";
import { AppRTU } from "../components/rtu";
import { AppAPI } from "../components/api";
import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

import { ConfigurationService } from "./configuration";

@Injectable()
export class StatisticsService {

	constructor(
		public http: Http,
		public storage: Storage,
		public configSvc: ConfigurationService
	){
		AppAPI.setHttp(this.http);
		AppRTU.registerAsObjectScopeProcessor("Books", "Statistic", (message: any) => this.processRTU(message));
	}

	// working with status
	async loadStatusAsync(onCompleted?: (d: any) => void) {
		var data = await this.storage.get("VIEApps-Status");
		if (AppUtility.isNotEmpty(data)) {
			AppData.Statistics.Status = new List<any>(JSON.parse(data as string))
				.Select(d => AppModels.StatisticBase.deserialize(d))
				.ToArray();
			AppEvents.broadcast("StatusAreUpdated");
		}
		onCompleted != undefined && onCompleted(AppData.Statistics.Status);
	}

	async saveStatusAsync(onCompleted?: (d: any) => void) {
		var status = new List<AppModels.StatisticBase>(AppData.Statistics.Status)
			.Where(s => s.Name != "OnlineUsers")
			.ToArray();
		await this.storage.set("VIEApps-Status", JSON.stringify(status));
		onCompleted != undefined && onCompleted(AppData.Statistics.Status);
	}

	async updateStatusAsync(data: any, onCompleted?: (d: any) => void) {
		if (AppUtility.isArray(data)) {
			AppData.Statistics.Status = new List<any>(data)
				.Select(d => AppModels.StatisticBase.deserialize(d))
				.ToArray();
		}
		else {
			let online = new List<AppModels.StatisticBase>(AppData.Statistics.Status)
				.Where(s => s.Name == "OnlineUsers")
				.FirstOrDefault();

			if (online != undefined) {
				online.Counters = data as number;
			}
			else {
				AppData.Statistics.Status.push(AppModels.StatisticBase.deserialize({ Name: "OnlineUsers", Counters: data as number }));
			}
		}

		await this.saveStatusAsync(onCompleted);
	}

	async fetchStatusAsync(onNext?: (d: any) => void, onError?: (e: any) => void) {
		if (AppRTU.isReady()) {
			AppRTU.call("books", "statistic", "GET", { "object-identity": "status" });
		}
		else {
			try {
				let response = await AppAPI.GetAsync("books/statistic/status");
				let data = response.json();
				await this.updateStatusAsync(data.Objects);
				onNext != undefined && onNext(data);
			}
			catch (e) {
				AppUtility.showError("[Statistics]: Error occurred while fetching status", e.json(), onError);
			}
		}
	}

	// working with categories
	async loadCategoriesAsync(onCompleted?: (d: any) => void) {
		var data = await this.storage.get("VIEApps-Categories");
		if (AppUtility.isNotEmpty(data)) {
			AppData.Statistics.Categories = new List<any>(JSON.parse(data as string))
				.Select(c => AppModels.StatisticInfo.deserialize(c))
				.ToArray();
			if (AppData.Statistics.Categories.length > 0) {
				AppEvents.broadcast("CategoriesAreUpdated");
			}
		}
		onCompleted != undefined && onCompleted(AppData.Statistics.Categories);
	}

	async saveCategoriesAsync(onCompleted?: (d: any) => void) {
		await this.storage.set("VIEApps-Categories", JSON.stringify(AppData.Statistics.Categories));
		AppEvents.broadcast("CategoriesAreUpdated");
		onCompleted != undefined && onCompleted(AppData.Statistics.Categories);
	}

	async updateCategoriesAsync(categories: Array<any>, onCompleted?: (d: any) => void) {
		AppData.Statistics.Categories = new List(categories)
			.Select(c => AppModels.StatisticInfo.deserialize(c))
			.ToArray();
		await this.saveCategoriesAsync(onCompleted);
	}

	async fetchCategoriesAsync(onNext?: (d: any) => void, onError?: (e: any) => void) {
		if (AppRTU.isReady()) {
			AppRTU.call("books", "statistic", "GET", { "object-identity": "categories" });
		}
		else {
			try {
				let response = await AppAPI.GetAsync("books/statistic/categories");
				let data = response.json();
				await this.updateCategoriesAsync(data.Objects);
				onNext != undefined && onNext(data);
			}
			catch (e) {
				AppUtility.showError("[Statistics]: Error occurred while fetching categories", e.json(), onError);
			}
		}
	}

	// working with authors
	Authors: { Index, Chars } = null;

	async loadAuthorsAsync(onCompleted?: (d: any) => void) {
		var tasks: Array<Promise<any>> = [];
		new List(AppUtility.getChars()).ForEach((c) => {
			tasks.push(
				this.storage.get("VIEApps-Authors-" + c).then((data: any) => {
					if (AppUtility.isNotEmpty(data)) {
						AppData.Statistics.Authors.setValue(
							c,
							new List<any>(JSON.parse(data as string))
								.Select(a => AppModels.StatisticBase.deserialize(a))
								.ToArray()
						);
					}
				})
			);
		});
		await Promise.all(tasks);
		AppEvents.broadcast("AuthorsAreUpdated");
		onCompleted != undefined && onCompleted(AppData.Statistics.Authors);
	}

	async saveAuthorsAsync(char: string, onCompleted?: (d: any) => void) {
		await this.storage.set("VIEApps-Authors-" + char, JSON.stringify(AppData.Statistics.Authors.getValue(char)));
		onCompleted != undefined && onCompleted(AppData.Statistics.Authors.getValue(char));
	}

	async updateAuthorsAsync(char: string, authors: Array<any>, onCompleted?: (d: any) => void) {
		AppData.Statistics.Authors.setValue(
			char,
			new List(authors)
				.Select(a => AppModels.StatisticBase.deserialize(a))
				.ToArray()
		);
		await this.saveAuthorsAsync(char, onCompleted);
	}

	async fetchAuthorsAsync(onCompleted?: (d: any) => void) {
		if (this.Authors == null) {
			this.Authors = {
				Index: -1,
				Chars: AppUtility.getChars()
			};
		}

		this.Authors.Index++;

		if (this.Authors.Index < this.Authors.Chars.length) {
			try {
				let path = "books/statistic/authors"
					+ "?char=" + this.Authors.Chars[this.Authors.Index]
				let response = await AppAPI.GetAsync(path);
				await this.updateAuthorsAsync(this.Authors.Chars[this.Authors.Index], response.json().Objects);
				window.setTimeout(() => {
					this.fetchAuthorsAsync(onCompleted);
				}, 13);
			}
			catch (e) {
				AppUtility.showError("[Statistics]: Error occurred while fetching authors [" + this.Authors.Chars[this.Authors.Index] + "]", e.json());
			}
		}
		else {
			AppEvents.broadcast("AuthorsAreUpdated");
			onCompleted != undefined && onCompleted(AppData.Statistics.Authors);
		}
	}

	// load all statistics
	async loadStatisticsAsync() {
		await Promise.all([
			this.loadCategoriesAsync(),
			this.loadAuthorsAsync(),
			this.loadStatusAsync()
		]);
	}

	// fetch all statistics
	fetchStatistics() {
		// fetch statistics
		if (AppRTU.isReady()) {
			AppRTU.send({
				ServiceName: "books",
				ObjectName: "statistic",
				Verb: "GET",
				Query: {
					"object-identity": "all"
				}
			});
		}
		else {
			AppUtility.setTimeout(async () => {
				await Promise.all([
					this.fetchCategoriesAsync(),
					this.fetchAuthorsAsync(),
					this.fetchStatusAsync()
				]);
			});
		}
	}

	// process RTU message
	processRTU(message: any) {
		// parse
		var info = AppRTU.parse(message.Type);

		// status
		if (info.Event == "Status") {
			this.updateStatusAsync(message.Data.Objects);
		}
		
		// categories
		else if (info.Event == "Categories") {
			this.updateCategoriesAsync(message.Data.Objects);
		}

		// authors
		else if (info.Event == "Authors") {
			this.updateAuthorsAsync(message.Data.Char, message.Data.Objects);
		}
	}

}