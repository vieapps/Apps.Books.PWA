import { Component } from "@angular/core";
import { NavController, NavParams } from "ionic-angular";
import { List } from "linqts";

import { AppUtility } from "../../components/utility";
import { AppEvents } from "../../components/events";
import { AppData } from "../../models/data";
import { AppModels } from "../../models/objects";

import { ConfigurationService } from "../../services/configuration";
import { ResourcesService } from "../../services/resources";
import { BooksService } from "../../services/books";

import { ReadBookPage } from "../books/read/read";

@Component({
	selector: "page-home",
	templateUrl: "home.html"
})
export class HomePage {

	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public configSvc: ConfigurationService,
		public resourcesSvc: ResourcesService,
		public booksSvc: BooksService
	){
	}

	// attributes
	info = {
		title: "Trang nhất",
		introduction: "",
		books: undefined,
		isAppleOS: AppUtility.isAppleOS()
	}

	// events
	ionViewDidLoad() {
		AppEvents.on(
			"AppIsInitialized",
			() => {
				this.prepare();
			},
			"UpdateHomePageWhenAppIsInitializedEventHandler"
		);
	}

	ionViewDidEnter() {
		if (this.info.books != undefined) {
			this.update();
		}
		else if (this.configSvc.isReady()) {
			this.prepare();
		}
		AppUtility.trackPageView();
	}

	ionViewWillUnload() {
		AppEvents.off("AppIsInitialized", "UpdateHomePageWhenAppIsInitializedEventHandler");
	}

	// helpers
	prepare() {
		// introduction
		if (!AppData.Configuration.resources["introduction"]) {
			this.resourcesSvc.fetchResourceAsync(() => {
				this.info.introduction = AppData.Configuration.resources["introduction"];
			});
		}

		// newest books
		if (this.info.books != undefined) {
			this.update();
		}
		else {
			if (AppData.Books.size() < 1) {
				this.booksSvc.fetchAsync(
					{
						FilterBy: {},
						SortBy: {},
						Pagination: AppData.Paginations.default() 
					},
					() => {
						this.update();
					}
				);
			}
			else {
				this.update();
			}
		}
	}

	update() {
		// introduction
		if (AppData.Configuration.resources["introduction"]) {
			this.info.introduction = AppData.Configuration.resources["introduction"];
		}

		// newest books
		this.info.books = new List(AppData.Books.values())
			.OrderByDescending(b => b.LastUpdated)
			.Take(20)
			.ToArray();
		this.info.books = AppUtility.getTopScores(this.info.books, 12);
	}

	trackBy(index: number, book: AppModels.Book) {
		return book.ID;
	}

	openBook(book: AppModels.Book) {
		this.navCtrl.push(ReadBookPage, { ID: book.ID, Ref: "HomePage" });
	}

}
