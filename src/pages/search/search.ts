import { Component, ViewChild } from "@angular/core";
import { App, NavController, NavParams, Searchbar, InfiniteScroll } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts";

import { AppUtility } from "../../components/utility";
import { AppData } from "../../models/data";
import { AppModels } from "../../models/objects";

import { BooksService } from "../../services/books";
import { ReadBookPage } from "../books/read/read";

@Component({
	selector: "page-search",
	templateUrl: "search.html"
})
export class SearchPage {
	constructor(
		public app: App,
		public navCtrl: NavController,
		public navParams: NavParams,
		public keyboard: Keyboard,
		public booksSvc: BooksService
	){
	}

	// attributes
	info = {
		filterBy: {
			Query: undefined,
			And: {
				Category: {
					Equals: undefined
				},
				Author: {
					Equals: undefined
				}	
			}
		},
		pagination: AppData.Paginations.default(),
		totalRecords: 0,
		pageNumber: 0,
		title: "Searching..."
	};
	books: Array<AppModels.Book> = null;
	ratings = {};

	// controls
	@ViewChild(Searchbar) searchBarCtrl: Searchbar;
	infiniteScrollCtrl: InfiniteScroll = undefined;

	// page events
	ionViewDidLoad() {
		let filterBy = this.navParams.get("And");
		if (AppUtility.isObject(filterBy, true)) {
			this.info.filterBy.And.Category.Equals = filterBy.Category.Equals;	
			this.info.filterBy.And.Author.Equals = filterBy.Author.Equals;
		}

		this.info.filterBy.And.Category.Equals = this.info.filterBy.And.Category.Equals || "";
		this.info.filterBy.And.Author.Equals = this.info.filterBy.And.Author.Equals || "";
		
		this.info.title = "Tìm kiếm" + (
			this.info.filterBy.And.Category.Equals != ""
				? " chỉ trong [" + this.info.filterBy.And.Category.Equals + "]"
				: this.info.filterBy.And.Author.Equals != ""
					? " chỉ của [" + this.info.filterBy.And.Author.Equals + "]"
					: "");

		this.app.setTitle(this.info.title);
	}

	ionViewDidEnter() {
		AppUtility.focus(this.searchBarCtrl, this.keyboard);
		AppUtility.resetUri({ "search-books": undefined });
	}

	// event handlers
	onSearch() {
		this.books = [];
		this.doSearch(() => {
			if (this.infiniteScrollCtrl != undefined) {
				this.infiniteScrollCtrl.enable(true);
				this.infiniteScrollCtrl.complete();
			}
		});
	}

	onInfiniteScroll(infiniteScroll: InfiniteScroll) {
		// capture
		if (this.infiniteScrollCtrl == undefined) {
			this.infiniteScrollCtrl = infiniteScroll;
		}

		// next page
		if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
			this.doSearch(() => {
				this.infiniteScrollCtrl.complete();
			});
		}

		// no more result
		else {
			this.infiniteScrollCtrl.enable(false);
		}
	}

	// search and show the listing of books
	doSearch(onCompleted?: () => void) {
		// check
		if (this.info.filterBy.Query == "") {
			onCompleted != undefined && onCompleted();
			return;
		}

		// build well-formed request
		var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, r => {
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Category.Equals)) {
				r.FilterBy.And.Category.Equals = undefined;
			}
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Author.Equals)) {
				r.FilterBy.And.Author.Equals = undefined;
			}
		});

		// search e-books
		this.booksSvc.search(request,
			(data: any) => {
				this.doBuild(data);
				if (onCompleted != undefined) {
					onCompleted();
				}
				AppUtility.trackPageView(this.info.title, "search-books", { query: this.info.filterBy.Query, page: this.info.pageNumber });
			}
		);
	}

	doBuild(results?: any) {
		// get pagination
		var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, r => {
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Category.Equals)) {
				r.FilterBy.And.Category.Equals = undefined;
			}
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Author.Equals)) {
				r.FilterBy.And.Author.Equals = undefined;
			}
		});
		this.info.pagination = results != undefined && AppUtility.isNotEmpty(this.info.filterBy.Query)
			? AppData.Paginations.default(results.Data)
			: AppData.Paginations.get(request, "B");

		this.info.pageNumber = this.info.pagination.PageNumber;
		this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);

		// initialize
		var books = AppUtility.isNotEmpty(this.info.filterBy.Query) && results != undefined
			? new List<any>(results.Objects).Select(b => AppData.Books.containsKey(b.ID) ? AppData.Books.getValue(b.ID) : AppModels.Book.deserialize(b))
			: new List(AppData.Books.values());

		// filter
		if (!AppUtility.isNotEmpty(this.info.filterBy.Query)) {
			let filterbyCategory = AppUtility.isNotEmpty(this.info.filterBy.And.Category.Equals);
			let filterbyAuthor = AppUtility.isNotEmpty(this.info.filterBy.And.Author.Equals);

			if (filterbyCategory) {
				books = books.Where(b => AppUtility.indexOf(b.Category, this.info.filterBy.And.Category.Equals) == 0);
			}
			else if (filterbyAuthor) {
				books = books.Where(b => b.Author == this.info.filterBy.And.Author.Equals);
			}
		}

		// update the listing of books
		this.books = AppUtility.isNotEmpty(this.info.filterBy.Query)
			? this.books.concat(books.ToArray())
			: books.ToArray();

		// prepare ratings & stocks
		new List(this.books).ForEach(b => {
			if (!this.ratings[b.ID]) {
				let rating = b.RatingPoints.getValue("General");
				this.ratings[b.ID] = rating != undefined
					? rating.Average
					: 0;
			}
		});
	}

	trackBy(index: number, book: AppModels.Book) {
		return book.ID;
	}

	openBook(book: AppModels.Book) {
		this.navCtrl.push(ReadBookPage, { ID: book.ID, Refs: "Search", FilterBy: this.info.filterBy });
	}

}
