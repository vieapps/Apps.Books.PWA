import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { Storage } from "@ionic/storage";
import { List } from "linqts";
import * as Collections from "typescript-collections";
import "rxjs/add/operator/map";

import { AppUtility } from "../helpers/utility";
import { AppAPI } from "../helpers/api";
import { AppCrypto } from "../helpers/crypto";
import { AppEvents } from "../helpers/events";
import { AppRTU } from "../helpers/rtu";
import { AppData } from "../models/data";
import { AppModels } from "../models/objects";

import { StatisticsService } from "./statistics";

@Injectable()
export class BooksService {

	constructor(public http: Http, public storage: Storage, public statisticsSvc: StatisticsService) {
		AppAPI.setHttp(this.http);
		AppRTU.register("Books", (message: any) => this.processRTU(message));
	}

	search(request: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		request.Pagination.PageNumber++;
		let path = "books/book/search"
			+ "?x-request=" + AppUtility.getBase64UrlParam(request);
		var searcher = AppAPI.Get(path);

		if (onNext == undefined) {
			return searcher;
		}

		searcher.map(response => response.json()).subscribe(
			(data: any) => {
				if (data.Status == "OK") {
					new List<any>(data.Data.Objects).ForEach(b => AppModels.Book.update(b));
					!AppUtility.isNotEmpty(request.FilterBy.Query) && AppData.Paginations.set(data.Data, "B");
					onNext(data);
				}
				else {
					console.error("[Books]: Error occurred while searching books");
					AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
					onError != undefined && onError(data);
				}
			},
			(error: any) => {
				console.error("[Books]: Error occurred while searching books", error);
				onError != undefined && onError(error);
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
			if (data.Status == "OK") {
				new List<any>(data.Data.Objects).ForEach(b => AppModels.Book.update(b));
				AppData.Paginations.set(data.Data, "B");
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while fetching books");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while fetching books", e);
			onError != undefined && onError(e);
		}
	}

	async getAsync(id: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		var book = AppData.Books.getValue(id);
		if (book != undefined && (book.TOCs.length > 0 || book.Body != "")) {
			this.updateCounters(id);
			onNext != undefined && onNext();
			return;
		}

		try {
			let response = await AppAPI.GetAsync("books/book/" + id);
			let data = response.json();
			if (data.Status == "OK") {
				AppModels.Book.update(data.Data);
				this.updateCounters(id);
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while getting a book");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while getting a book", e);
			onError != undefined && onError(e);
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
			if (data.Status == "OK") {
				book.Chapters[chapter - 1] = data.Data.Content;
				this.updateCounters(id);
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while fetching chapter of a book");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while fetching a chapter of a book", e);
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
						this.updateCounters(id, "View", onCompleted);
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
		AppData.Books.getValue(id) != undefined
		&& AppRTU.isReady()
		&& AppRTU.call("books", "book", "GET", {
			"object-identity": "counters",
			"id": id,
			"action": action || "View"
		});
		onCompleted != undefined && onCompleted();
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

	generateFiles(id: string, onCompleted?: () => void) {
		AppData.Books.getValue(id) != undefined
		&& AppRTU.send({
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
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while sending request to update an e-book");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while sending request to update an e-book", e);
			onError != undefined && onError(e);
		}
	}

	async updateAsync(info: any, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.PutAsync("ebooks/" + AppCrypto.urlEncode(info.ID) + "/" + AppUtility.getBase64UrlParam({ ID: info.ID }), info);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while updating an e-book");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while updating an e-book", e);
			onError != undefined && onError(e);
		}
	}

	async deleteAsync(info, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.DeleteAsync("ebooks/" + AppCrypto.urlEncode(info.BookID) + "/" + AppUtility.getBase64UrlParam({ ID: info.BookID }));
			let data = response.json();
			if (data.Status == "OK") {
				AppData.Books.remove(info.BookID);
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while deleting an e-book");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while deleting an e-book", e);
			onError != undefined && onError(e);
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

	async saveOptionsAsync(onCompleted?: (data?: any) => void) {
		try {
			await this.storage.set("VIEApps-Reading-Options", JSON.stringify(AppData.Configuration.reading.options));
		}
		catch (e) {
			console.error("[Books]: Error occurred while saving the reading options into storage", e);
		}

		onCompleted != undefined && onCompleted(AppData.Configuration.reading.options);
	}

	async loadBookmarksAsync(onCompleted?: (data?: any) => void) {
		AppData.Configuration.reading.bookmarks = new Collections.Dictionary<string, AppModels.Bookmark>();

		try {
			let data = await this.storage.get("VIEApps-Bookmarks");
			if (AppUtility.isNotEmpty(data) && data != "{}") {
				let bookmarks = JSON.parse(data as string);
				for (let name in bookmarks.table) {
					let bookmark = bookmarks.table[name];
					AppData.Configuration.reading.bookmarks.setValue(bookmark.key, AppModels.Bookmark.deserialize(bookmark.value));
				}
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while loading the bookmarks", e);
		}

		onCompleted != undefined && onCompleted(AppData.Configuration.reading.bookmarks);
	}

	async saveBookmarksAsync(onCompleted?: (data?: any) => void) {
		try {
			await this.storage.set("VIEApps-Bookmarks", JSON.stringify(AppData.Configuration.reading.bookmarks));
		}
		catch (e) {
			console.error("[Books]: Error occurred while saving the bookmarks into storage", e);
		}

		onCompleted != undefined && onCompleted(AppData.Configuration.reading.bookmarks);
	}

	async updateBookmarksAsync(id: string, chapter: number, offset: number, onCompleted?: (data?: any) => void) {
		var bookmark = new AppModels.Bookmark();
		bookmark.ID = id;
		bookmark.Chapter = chapter;
		bookmark.Offset = offset;
		AppData.Configuration.reading.bookmarks.setValue(bookmark.ID, bookmark);

		if (AppData.Configuration.reading.bookmarks.size() > 30) {
			let bookmarks = new Collections.Dictionary<string, AppModels.Bookmark>();
			let min = AppData.Configuration.reading.bookmarks.size() - 30;
			new List(AppData.Configuration.reading.bookmarks.values()).ForEach((b, i) => {
				if (i >= min) {
					bookmarks.setValue(b.ID, b);
				}
			});
			AppData.Configuration.reading.bookmarks = bookmarks;
		}

		await this.saveBookmarksAsync(onCompleted);
	}

	processRTU(message: any) {
		// stop on error message
		if (message.Type == "Error") {
			console.warn("[Books]: got an error message from RTU", message);
			return;
		}

		// parse
		var info = AppRTU.parse(message.Type);

		// counters
		if (info.ObjectName == "Book#Counters") {
			this.setCounters(message.Data);
		}

		// chapter
		else if (info.ObjectName == "Book#Chapter") {
			let book = AppData.Books.getValue(message.Data.ID);
			if (book != undefined) {
				book.Chapters[message.Data.Chapter - 1] = message.Data.Content;
			}
		}

		// files
		else if (info.ObjectName == "Book#Files") {
			this.updateFiles(message.Data);
		}

		// delete
		else if (info.ObjectName == "Book#Delete") {
			AppData.Books.remove(message.Data.ID);
			AppEvents.broadcast("BooksAreUpdated");
		}
		
		// statistics
		else if (AppUtility.indexOf(info.ObjectName, "Statistic#") > -1) {
			this.statisticsSvc.processRTU(message);
		}
	}

}