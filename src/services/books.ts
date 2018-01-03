import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { List } from "linqts";

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
		public configSvc: ConfigurationService,
		public statisticsSvc: StatisticsService
	){
		AppAPI.setHttp(this.http);
		AppRTU.register("Books", (message: any) => this.processRTU(message));
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
			if (data.Status == "OK") {
				AppModels.Book.update(data.Data);
				if (!AppUtility.isTrue(dontUpdateCounter)) {
					this.updateCounters(id);
				}
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
			let response = await AppAPI.PutAsync("books/book/" + info.ID, info);
			let data = response.json();
			if (data.Status == "OK") {
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while updating a book");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while updating a book", e);
			onError != undefined && onError(e);
		}
	}

	async deleteAsync(id: string, onNext?: (data?: any) => void, onError?: (error?: any) => void) {
		try {
			let response = await AppAPI.DeleteAsync("books/book/" + id);
			let data = response.json();
			if (data.Status == "OK") {
				AppData.Books.remove(id);
				onNext != undefined && onNext(data);
			}
			else {
				console.error("[Books]: Error occurred while deleting a book");
				AppUtility.isObject(data.Error, true) && console.log("[" + data.Error.Type + "]: " + data.Error.Message);
				onError != undefined && onError(data);
			}
		}
		catch (e) {
			console.error("[Books]: Error occurred while deleting a book", e);
			onError != undefined && onError(e);
		}
	}

	processRTU(message: any) {
		// stop on error message
		if (message.Type == "Error") {
			console.warn("[Books]: got an error message from RTU", message);
			return;
		}

		// parse
		var info = AppRTU.parse(message.Type);

		// book information
		if (info.ObjectName == "Book") {
			AppModels.Book.update(message.Data);
			AppEvents.broadcast("BookIsUpdated", message.Data);
		}

		// books' counters
		else if (info.ObjectName == "Book#Counters") {
			this.setCounters(message.Data);
		}

		// book's chapter
		else if (info.ObjectName == "Book#Chapter") {
			let book = AppData.Books.getValue(message.Data.ID);
			if (book != undefined) {
				book.Chapters[message.Data.Chapter - 1] = message.Data.Content;
			}
		}

		// books' files
		else if (info.ObjectName == "Book#Files") {
			this.updateFiles(message.Data);
		}

		// book is deleted
		else if (info.ObjectName == "Book#Delete") {
			AppData.Books.remove(message.Data.ID);
			AppEvents.broadcast("BooksAreUpdated", message.Data);
		}
		
		// bookmarks
		else if (info.ObjectName == "Bookmarks") {
			if (this.configSvc.isAuthenticated() && AppData.Configuration.session.account.id == message.Data.ID) {
				this.configSvc.syncBookmarks(message.Data);
			}
		}
		
		// statistics
		else if (AppUtility.indexOf(info.ObjectName, "Statistic#") == 0) {
			this.statisticsSvc.processRTU(message);
		}
	}

}