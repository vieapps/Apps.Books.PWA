import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { Storage } from "@ionic/storage";
import { List } from "linqts";
import * as Collections from "typescript-collections";

import { AppUtility } from "../components/utility";
import { AppAPI } from "../components/api";
import { AppCrypto } from "../components/crypto";
import { AppEvents } from "../components/events";
import { AppRTU } from "../components/rtu";
import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

import { ConfigurationService } from "./configuration";
import { StatisticsService } from "./statistics";

@Injectable()
export class BooksService {

	constructor(
		public http: Http,
		public storage: Storage,
		public configSvc: ConfigurationService,
		public statisticsSvc: StatisticsService
	){
		AppAPI.setHttp(this.http);
		AppRTU.registerAsObjectScopeProcessor("Books", "Book", (message: any) => this.processRTU(message));
		AppRTU.registerAsObjectScopeProcessor("Books", "Bookmarks", (message: any) => {
			if (this.configSvc.isAuthenticated() && AppData.Configuration.session.account.id == message.Data.ID) {
				this.syncBookmarks(message.Data);
			}
		});
		AppRTU.registerAsServiceScopeProcessor("Books", (message: any) => {});
		AppRTU.registerAsServiceScopeProcessor("Scheduler", (message: any) => this.sendBookmarks());
	}

	search(request: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		request.Pagination.PageNumber++;
		let path = "books/book/search"
			+ "?x-request=" + AppUtility.getBase64UrlParam(request);
		var searcher = AppAPI.Get(path);

		if (!onNext) {
			return searcher;
		}

		searcher.map(response => response.json()).subscribe(
			(data: any) => {
				new List<any>(data.Objects).ForEach(b => AppModels.Book.update(b));
				!AppUtility.isNotEmpty(request.FilterBy.Query) && AppData.Paginations.set(data, "B");
				onNext(data);
			},
			(error: any) => {
				AppUtility.showError("[Books]: Error occurred while searching books", error, onError);
			}
		);
	}

	async fetchAsync(request: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		var pagination = AppData.Paginations.get(request, "B");
		if (AppUtility.isObject(pagination, true) && pagination.TotalPages && pagination.PageNumber && pagination.PageNumber >= pagination.TotalPages) {
			onNext != undefined && onNext();
			return;
		}

		try {
			request.Pagination.PageNumber++;
			let path = "books/book/search"
				+ "?x-request=" + AppUtility.getBase64UrlParam(request);
			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			new List<any>(data.Objects).ForEach(b => AppModels.Book.update(b));
			AppData.Paginations.set(data, "B");
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Books]: Error occurred while fetching books", e.json(), onError);
		}
	}

	async getAsync(id: string, onNext?: (data?: any) => void, onError?: (error?: any) => void, dontUpdateCounter?: boolean) {
		var book = AppData.Books.getValue(id);
		if (book != undefined && (book.TOCs.length > 0 || book.Body != "")) {
			if (!AppUtility.isTrue(dontUpdateCounter)) {
				this.updateCounters(id);
			}
			onNext != undefined && onNext();
			return;
		}

		try {
			let response = await AppAPI.GetAsync("books/book/" + id);
			let data = response.json();
			AppModels.Book.update(data);
			if (!AppUtility.isTrue(dontUpdateCounter)) {
				this.updateCounters(id);
			}
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Books]: Error occurred while fetching a book", e.json(), onError);
		}
	}

	async getChapterAsync(id: string, chapter: number, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		var book = AppData.Books.getValue(id);
		if (book == undefined || book.TOCs.length < 1) {
			onError != undefined && onError();
			return;
		}
		else if (chapter < 1 || chapter > book.Chapters.length || book.Chapters[chapter - 1] != "") {
			onNext != undefined && onNext();
			return;
		}

		try {
			let path = "books/book/" + id
				+ "?chapter=" + chapter;
			let response = await AppAPI.GetAsync(path);
			let data = response.json();
			book.Chapters[chapter - 1] = data.Content;
			this.updateCounters(id);
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Books]: Error occurred while fetching a book's chapter", e.json(), onError);
			onError != undefined && onError(e);
		}
	}

	async fetchChapterAsync(id: string, chapter: number, onCompleted?: () => void) {
		var book = AppData.Books.getValue(id);
		while (chapter < book.TotalChapters && book.Chapters[chapter - 1] != "")
			chapter += 1;

		if (book.Chapters[chapter - 1] == "") {
			if (AppRTU.isReady()) {
				AppRTU.call("books", "book", "GET", {
					"object-identity": "chapter",
					"id": id,
					"chapter": chapter
				}, undefined, undefined, undefined, () => {
					AppUtility.setTimeout(() => {
						if (book.Chapters[chapter - 1] == "") {
							this.getChapterAsync(id, chapter, onCompleted);
						}
						else {
							this.updateCounters(id, "View", onCompleted);
						}
					}, 123);
				});
			}
			else {
				await this.getChapterAsync(id, chapter, onCompleted);
			}
		}
		else if (chapter <= book.TotalChapters) {
			this.updateCounters(id, "View", onCompleted);
		}
	}

	updateCounters(id: string, action?: string, onCompleted?: () => void) {
		if (AppData.Books.getValue(id) != undefined) {
			if (AppRTU.isReady()) {
				AppRTU.call("books", "book", "GET", {
					"object-identity": "counters",
					"id": id,
					"action": action || "View"
				});
				onCompleted != undefined && onCompleted();
			}
			else {
				let path = "books/book/counters"
					+ "?id=" + id
					+ "&action=" + (action || "View");
				AppAPI.Get(path).map(response => response.json()).subscribe(
					(data: any) => {
						onCompleted != undefined && onCompleted();
					},
					(error: any) => {
						AppUtility.showError("[Books]: Error occurred while fetching counters", error);
					}
				);
			}
		}
	}

	setCounters(info: any, onCompleted?: () => void) {
		var book = AppUtility.isObject(info, true)
			? AppData.Books.getValue(info.ID)
			: undefined;

		if (book != undefined && AppUtility.isArray(info.Counters)) {
			new List<any>(info.Counters).ForEach(c => book.Counters.setValue(c.Type, AppModels.CounterInfo.deserialize(c)));
			AppEvents.broadcast("BookStatisticsAreUpdated", { ID: book.ID });
		}

		onCompleted != undefined && onCompleted();
	}

	generateFiles(id: string) {
		AppData.Books.containsKey(id) && AppRTU.send({
			ServiceName: "books",
			ObjectName: "book",
			Verb: "GET",
			Query: {
				"object-identity": "files",
				"id": id
			}
		});
	}

	updateFiles(data: any) {
		var book = data.ID != undefined
			? AppData.Books.getValue(data.ID)
			: undefined;
		if (book != undefined && AppUtility.isObject(data.Files, true)) {
			book.Files = data.Files;
			AppEvents.broadcast("BookFilesAreUpdated", { ID: book.ID });
		}
	}

	async requestUpdateAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.PostAsync("books/book/" + AppCrypto.urlEncode(info.ID) + "/" + AppUtility.getBase64UrlParam({ ID: info.ID }), info);
			let data = response.json();
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Books]: Error occurred while sending a request to update an e-book", e.json(), onError);
		}
	}

	async updateAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.PutAsync("books/book/" + info.ID, info);
			let data = response.json();
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Books]: Error occurred while updating an e-book", e.json(), onError);
		}
	}

	async deleteAsync(id: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.DeleteAsync("books/book/" + id);
			let data = response.json();
			AppData.Books.remove(id);
			onNext != undefined && onNext(data);
		}
		catch (e) {
			AppUtility.showError("[Books]: Error occurred while deleting an e-book", e.json(), onError);
		}
	}

	async loadOptionsAsync(onCompleted?: (data?: any) => void) {
		try {
			let data = await this.storage.get("VIEApps-Reading-Options");
			if (AppUtility.isNotEmpty(data) && data != "{}") {
				AppData.Configuration.reading.options = JSON.parse(data as string);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while loading the reading options", e);
		}
		onCompleted != undefined && onCompleted(AppData.Configuration.reading.options);
	}

	/** Saves the reading options into storage */
	async saveOptionsAsync(onCompleted?: (data?: any) => void) {
		try {
			await this.storage.set("VIEApps-Reading-Options", JSON.stringify(AppData.Configuration.reading.options));
		}
		catch (e) {
			console.error("[Books]: Error occurred while saving the reading options into storage", e);
		}
		onCompleted != undefined && onCompleted(AppData.Configuration.reading.options);
	}

	/** Loads the bookmarks from storage */
	async loadBookmarksAsync(onCompleted?: () => void) {
		AppData.Configuration.reading.bookmarks = new Collections.Dictionary<string, AppModels.Bookmark>();
		try {
			let data = await this.storage.get("VIEApps-Bookmarks");
			if (AppUtility.isNotEmpty(data) && data != "{}" && data != "[]") {
				new List<any>(JSON.parse(data as string)).ForEach(b => {
					let bookmark = AppModels.Bookmark.deserialize(b);
					AppData.Configuration.reading.bookmarks.setValue(bookmark.ID, bookmark);
				});
				onCompleted != undefined && onCompleted();
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while loading the bookmarks", e);
		}
	}

	/** Saves the bookmarks into storage */
	async saveBookmarksAsync(onCompleted?: () => void) {
		try {
			let bookmarks = new List(AppData.Configuration.reading.bookmarks.values())
				.OrderByDescending(b => b.Time)
				.Take(30)
				.ToArray();
			await this.storage.set("VIEApps-Bookmarks", JSON.stringify(bookmarks));
			onCompleted != undefined && onCompleted();
		}
		catch (e) {
			console.error("[Books]: Error occurred while saving the bookmarks into storage", e);
		}
	}

	/** Updates a bookmark */
	async updateBookmarksAsync(id: string, chapter: number, offset: number, onCompleted?: () => void) {
		var bookmark = new AppModels.Bookmark();
		bookmark.ID = id;
		bookmark.Chapter = chapter;
		bookmark.Position = offset;

		AppData.Configuration.reading.bookmarks.setValue(bookmark.ID, bookmark);
		await this.saveBookmarksAsync(onCompleted);
	}

	/** Sends the request to get bookmarks from APIs */
	getBookmarks(onCompleted?: () => void) {
		AppRTU.send({
			ServiceName: "books",
			ObjectName: "bookmarks",
			Verb: "GET"
		});
		onCompleted != undefined && onCompleted();
	}

	/** Syncs the bookmarks with APIs */
	sendBookmarks(onCompleted?: () => void) {
		if (this.configSvc.isAuthenticated()) {
			AppRTU.send({
				ServiceName: "books",
				ObjectName: "bookmarks",
				Verb: "POST",
				Body: JSON.stringify(new List(AppData.Configuration.reading.bookmarks.values())
					.OrderByDescending(b => b.Time)
					.Take(30)
					.ToArray())
			});
			onCompleted != undefined && onCompleted();
		}
	}

	/** Merges the bookmarks with APIs */
	syncBookmarks(data: any, onCompleted?: () => void) {
		if (AppData.Configuration.session.account && AppData.Configuration.session.account.profile) {
			AppData.Configuration.session.account.profile.LastSync = new Date();
		}
		
		if (AppUtility.isTrue(data.Sync)) {
			AppData.Configuration.reading.bookmarks.clear();
		}

		new List<any>(data.Objects)
			.ForEach(b => {
				let bookmark = AppModels.Bookmark.deserialize(b);
				if (!AppData.Configuration.reading.bookmarks.containsKey(bookmark.ID)) {
					AppData.Configuration.reading.bookmarks.setValue(bookmark.ID, bookmark);
				}
				else if (bookmark.Time > AppData.Configuration.reading.bookmarks.getValue(bookmark.ID).Time) {
					AppData.Configuration.reading.bookmarks.setValue(bookmark.ID, bookmark);
				}
			});

		new List(AppData.Configuration.reading.bookmarks.values())
			.ForEach((b, i)  => {
				AppUtility.setTimeout(() => {
					if (!AppData.Books.getValue(b.ID)) {
						AppRTU.send({
							ServiceName: "books",
							ObjectName: "book",
							Verb: "GET",
							Query: {
								"object-identity": b.ID
							}
						});
					}
				}, 456 + (i * 10));
			});

		AppUtility.setTimeout(async () => {
			AppEvents.broadcast("BookmarksAreUpdated");
			await this.saveBookmarksAsync(onCompleted);
		});
	}

	/** Sends the request to delete a bookmark from APIs */
	deleteBookmark(id: string, onCompleted?: () => void) {
		AppRTU.send({
			ServiceName: "books",
			ObjectName: "bookmarks",
			Verb: "DELETE",
			Query: {
				"object-identity": id
			}
		});
		AppData.Configuration.reading.bookmarks.remove(id);
		onCompleted != undefined && onCompleted();
	}

	processRTU(message: any) {
		// parse
		var info = AppRTU.parse(message.Type);

		// counters
		if (info.Event == "Counters") {
			this.setCounters(message.Data);
		}

		// chapter
		else if (info.Event == "Chapter") {
			let book = AppData.Books.getValue(message.Data.ID);
			if (book != undefined) {
				book.Chapters[message.Data.Chapter - 1] = message.Data.Content;
			}
		}

		// files
		else if (info.Event == "Files") {
			this.updateFiles(message.Data);
		}

		// book is deleted
		else if (info.Event == "Delete") {
			AppData.Books.remove(message.Data.ID);
			AppEvents.broadcast("BooksAreUpdated", message.Data);
		}

		// other events
		else {
			AppModels.Book.update(message.Data);
			AppEvents.broadcast("BookIsUpdated", message.Data);
		}
	}

}