import { Component, ViewChild } from "@angular/core";
import { NavController, NavParams, ActionSheetController, AlertController, Searchbar, InfiniteScroll, Content } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts";

import { AppUtility } from "../../../helpers/utility";
import { AppEvents } from "../../../helpers/events";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { AuthenticationService } from "../../../providers/authentication";
import { BooksService } from "../../../providers/books";

import { SearchPage } from "../../search/search";
import { ReadBookPage } from "../read/read";

@Component({
	selector: "page-surf-books",
	templateUrl: "surf.html"
})
export class SurfBooksPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public actionSheetCtrl: ActionSheetController,
		public alertCtrl: AlertController,
		public keyboard: Keyboard,
		public authSvc: AuthenticationService,
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
		sortBy: "",
		pagination: AppData.Paginations.default(),
		title: "Loading...",
		processing: false,
		filtering: false,
		totalRecords: 0,
		pageNumber: 0,
		isAppleOS: AppUtility.isAppleOS()
	};
	sorts: Array<any> = [];
	books: Array<AppModels.Book> = [];
	ratings = {};

	// controls
	@ViewChild(Searchbar) searchBarCtrl: Searchbar;
	@ViewChild(Content) contentCtrl: Content;
	infiniteScrollCtrl: InfiniteScroll = undefined;

	// page events
	ionViewDidLoad() {
		this.sorts = [
		{
			label: "Tiêu đề (A - Z)",
			value: "Title"
		},
		{
			label: "Mới cập nhật",
			value: "LastUpdated"
		},
		{
			label: "Nhiều chương/phần",
			value: "Chapters"
		}];
		this.info.sortBy = this.sorts[1].value;

		this.info.filterBy.And.Category.Equals = this.navParams.get("Category");
		this.info.filterBy.And.Category.Equals = this.info.filterBy.And.Category.Equals || "";

		this.info.filterBy.And.Author.Equals = this.navParams.get("Author");
		this.info.filterBy.And.Author.Equals = this.info.filterBy.And.Author.Equals || "";

		this.info.title = this.info.filterBy.And.Category.Equals != ""
			? "Thể loại: " + this.info.filterBy.And.Category.Equals
			: "Tác giả: " + this.info.filterBy.And.Author.Equals;
	}

	ionViewDidEnter() {
		var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, (r) => {
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Category.Equals)) {
				r.FilterBy.And.Category.Equals = undefined;
			}
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Author.Equals)) {
				r.FilterBy.And.Author.Equals = undefined;
			}
		});
		this.info.pagination = AppData.Paginations.get(request, "B");

		if (this.info.pagination == undefined) {
			this.doSearch();
		}
		else {
			if (this.info.pageNumber < 1) {
				this.info.pageNumber = 1;
				this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
			}
			this.doBuild();
		}

		AppEvents.broadcast("UpdateActiveNav", { name: "SurfBooksPage", component: SurfBooksPage, params: this.navParams.data });
	}

	// search & build the listing of books
	doSearch(onCompleted?: () => void) {
		var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, (r) => {
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Category.Equals)) {
				r.FilterBy.And.Category.Equals = undefined;
			}
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Author.Equals)) {
				r.FilterBy.And.Author.Equals = undefined;
			}
		});
		
		this.booksSvc.fetchAsync(request, (data?: any) => {
			this.info.pagination = AppData.Paginations.get(request, "B");
			this.info.pageNumber = this.info.pagination.PageNumber;
			this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
			this.doBuild(undefined, onCompleted);
		});
	}

	doBuild(results?: Array<AppModels.Book>, onCompleted?: () => void) {
		// initialize
		var books = new List(results || AppData.Books.values());

		// filter
		var query = this.info.filtering && AppUtility.isNotEmpty(this.info.filterBy.Query)
			? AppUtility.toANSI(this.info.filterBy.Query).trim().toLowerCase()
			: "";
		if (query != "" || this.info.filterBy.And.Category.Equals != "" || this.info.filterBy.And.Author.Equals != "") {
			books = books.Where(b => (query != "" ? AppUtility.indexOf(b.ANSITitle, query) > -1 : true)
				&& (this.info.filterBy.And.Category.Equals != "" ? AppUtility.indexOf(b.Category, this.info.filterBy.And.Category.Equals) == 0 : true)
				&& (this.info.filterBy.And.Author.Equals != "" ? b.Author == this.info.filterBy.And.Author.Equals : true)
			);
		}

		// sort
		switch (this.info.sortBy) {
			case "LastUpdated":
				books = books.OrderByDescending(b => b.LastUpdated);
				break;

			case "Chapters":
				books = books.OrderByDescending(b => b.TotalChapters).ThenBy(a => a.LastUpdated);
				break;

			default:
				books = books.OrderBy(b => b.Title).ThenByDescending(a => a.LastUpdated);
				break;
		}

		// paging
		if (!this.info.filtering && this.info.pageNumber > 0) {
			books = books.Take(this.info.pageNumber * this.info.pagination.PageSize);
		}

		// convert the list of results to array
		this.books = books.ToArray();

		// prepare ratings & stocks
		new List(this.books).ForEach(b => {
			if (!this.ratings[b.ID]) {
				let rating = b.RatingPoints.getValue("General");
				this.ratings[b.ID] = rating != undefined ? rating.Average : 0;
			}
		});

		// run handler
		onCompleted != undefined && onCompleted();
	}

	trackBy(index: number, book: AppModels.Book) {
		return book.ID;
	}

	// event handlers
	onInfiniteScroll(infiniteScroll: InfiniteScroll) {
		// capture
		if (this.infiniteScrollCtrl == undefined) {
			this.infiniteScrollCtrl = infiniteScroll;
		}

		// stop if processing or filtering
		if (this.info.processing || this.info.filtering) {
			this.completeInfiniteScroll();
		}

		// searching
		else {
			this.info.processing = true;
			if (this.info.pageNumber < this.info.pagination.PageNumber) {
				this.info.pageNumber++;
				this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				this.doBuild(undefined, () => {
					this.completeInfiniteScroll(() => {
						this.info.processing = false;
					});
				});
			}
			else if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
				if (this.info.sortBy != "LastUpdated") {
					this.scrollToAsync(55, () => {
						this.doSearch(() => {
							this.completeInfiniteScroll();
							this.info.processing = false;
						});
					});
				}
				else {
					this.doSearch(() => {
						this.completeInfiniteScroll();
						this.info.processing = false;
					});
				}
			}
			else {
				this.disableInfiniteScroll();
				this.completeInfiniteScroll();
				this.info.processing = false;
			}
		}
	}

	onFilter() {
		this.info.processing = true;
		this.doBuild(undefined, () => {
			this.disableInfiniteScroll();
			this.info.processing = false;
		});
	}

	onCancel() {
		this.info.processing = true;
		this.info.filtering = false;
		this.info.filterBy.Query = "";

		var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, (r) => {
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Category.Equals)) {
				r.FilterBy.And.Category.Equals = undefined;
			}
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Author.Equals)) {
				r.FilterBy.And.Author.Equals = undefined;
			}
		});
		this.info.pagination = AppData.Paginations.get(request, "B");

		this.doBuild(undefined, () => {
			this.enableInfiniteScroll();
			this.info.processing = false;
		});
	}

	// helpers
	completeInfiniteScroll(onCompleted?: () => void) {
		if (this.infiniteScrollCtrl != undefined) {
			this.infiniteScrollCtrl.complete();
			onCompleted != undefined && onCompleted();
		}
		else {
			onCompleted != undefined && onCompleted();
		}
	}

	enableInfiniteScroll() {
		if (this.infiniteScrollCtrl != undefined) {
			this.infiniteScrollCtrl.enable(true);
		}
	}

	disableInfiniteScroll() {
		if (this.infiniteScrollCtrl != undefined) {
			this.infiniteScrollCtrl.enable(false);
		}
	}

	async scrollToTopAsync(onCompleted?: () => void) {
		await this.contentCtrl.scrollToTop();
		onCompleted != undefined && onCompleted();
	}

	async scrollToBottomAsync(onCompleted?: () => void) {
		await this.contentCtrl.scrollToBottom();
		onCompleted != undefined && onCompleted();
	}

	async scrollToAsync(offset?: number, onCompleted?: () => void) {
		await this.contentCtrl.scrollTo(0, offset != undefined ? this.contentCtrl.scrollTop - offset : 0);
		onCompleted != undefined && onCompleted();
	}

	openBook(book: AppModels.Book) {
		this.navCtrl.push(ReadBookPage, { ID: book.ID });
	}

	showFilter() {
		this.info.filtering = true;
		AppUtility.focus(this.searchBarCtrl, this.keyboard);
	}

	showActions() {
		var actionSheet = this.actionSheetCtrl.create({
			enableBackdropDismiss: true,
			buttons: [
				{
					text: "Mở tìm kiếm",
					icon: this.info.isAppleOS ? undefined : "search",
					handler: () => {
						AppEvents.broadcast("OpenPage", { component: SearchPage, params: this.info.filterBy, doPush: true });
					}
				},
				{
					text: "Lọc/Tìm nhanh",
					icon: this.info.isAppleOS ? undefined : "funnel",
					handler: () => {
						this.showFilter();
					}
				},
				{
					text: "Thay đổi cách sắp xếp",
					icon: this.info.isAppleOS ? undefined : "list-box",
					handler: () => {
						this.showSorts();
					}
				}
			]
		});

		if (this.info.pagination != null && this.info.pageNumber < this.info.pagination.PageNumber) {
			actionSheet.addButton({
				text: "Hiển thị toàn bộ " + AppData.Paginations.computeTotal(this.info.pagination.PageNumber, this.info.pagination) + " kết quả",
				icon: this.info.isAppleOS ? undefined : "eye",
				handler: () => {
					this.info.pageNumber = this.info.pagination.PageNumber;
					this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
					this.doBuild();
				}
			});
		}

		actionSheet.addButton({
			text: "Huỷ bỏ",
			icon: this.info.isAppleOS ? undefined : "close",
			role: "cancel"
		});
		
		actionSheet.present();
	}

	showSorts() {
		var alert = this.alertCtrl.create({
			title: "Sắp xếp theo",
			enableBackdropDismiss: true,
			buttons: [
			{
				text: "Huỷ"
			},
			{
				text: "Đặt",
				handler: (sortBy: string) => {
					if (this.info.sortBy != sortBy) {
						this.info.sortBy = sortBy;
						this.info.processing = true;
						this.disableInfiniteScroll();
						this.doBuild(this.books, () => {
							this.scrollToTopAsync(() => {
								this.enableInfiniteScroll();
								this.info.processing = false;
							});
						});
					}
				}
			}]
		});

		new List(this.sorts).ForEach(o => alert.addInput({ type: "radio", label: o.label, value: o.value, checked: this.info.sortBy == o.value}));
		alert.present();
	}

}