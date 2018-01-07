import { Component, ViewChild } from "@angular/core";
import { App, NavController, NavParams, ActionSheetController, AlertController, Searchbar, InfiniteScroll, Content } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts";

import { AppUtility } from "../../../components/utility";
import { AppEvents } from "../../../components/events";
import { AppRTU } from "../../../components/rtu";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { AuthenticationService } from "../../../services/authentication";
import { BooksService } from "../../../services/books";

import { SearchPage } from "../../search/search";
import { ReadBookPage } from "../read/read";

@Component({
	selector: "page-surf-books",
	templateUrl: "surf.html"
})
export class SurfBooksPage {
	constructor(
		public app: App,
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
		name: "all",
		processing: false,
		filtering: false,
		totalRecords: 0,
		pageNumber: 0,
		displayPages: 3,
		offset: 96,
		mode: "auto",
		isAppleOS: AppUtility.isAppleOS()
	};
	sorts: Array<any> = [];
	books: Array<AppModels.Book> = [];
	ratings = {};

	// controls
	@ViewChild(Searchbar) searchBarCtrl: Searchbar;
	@ViewChild(Content) contentCtrl: Content;
	
	// when the page has loaded (only once)
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

		this.info.name = this.info.filterBy.And.Category.Equals != ""
			? "category:" + AppUtility.toANSI(this.info.filterBy.And.Category.Equals).replace(/\s/g, "-").toLowerCase()
			: this.info.filterBy.And.Author.Equals != ""
				? "author:" + AppUtility.toANSI(this.info.filterBy.And.Author.Equals).replace(/\s/g, "-").toLowerCase()
				: "all";

		AppEvents.on(
			"BooksAreUpdated",
			(info: any) => {
				if ((this.info.filterBy.And.Category.Equals != "" && this.info.filterBy.And.Category.Equals == info.args.Category)
				|| (this.info.filterBy.And.Author.Equals != "" && this.info.filterBy.And.Author.Equals == info.args.Author)) {
					this.build();
				}
			},
			"SurfBooksEventHandler"
		);
	}
	
	// when the page has active
	ionViewDidEnter() {
		// set active page
		AppEvents.broadcast("UpdateActiveNav", { name: "SurfBooksPage", component: SurfBooksPage, params: this.navParams.data });
		AppUtility.resetUri({ "surf-books": AppUtility.getBase64UrlParam(this.info.filterBy), name: this.info.name });
		this.app.setTitle(this.info.title);

		// books
		if (this.books.length < 1) {
			var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, r => {
				if (!AppUtility.isNotEmpty(r.FilterBy.And.Category.Equals)) {
					r.FilterBy.And.Category.Equals = undefined;
				}
				if (!AppUtility.isNotEmpty(r.FilterBy.And.Author.Equals)) {
					r.FilterBy.And.Author.Equals = undefined;
				}
			});
			this.info.pagination = AppData.Paginations.get(request, "B");
	
			if (this.info.pagination == undefined) {
				this.search();
			}
			else {
				this.info.pageNumber = 1;
				this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				this.build();
			}
		}
	}

	ionViewWillUnload() {
		AppEvents.off("BooksAreUpdated", "SurfBooksEventHandler");
	}

	// books
	get(onepage: boolean = true, pageNumber?: number) {
		// initialize
		var books = new List(AppData.Books.values());
		
		// filter
		var query = this.info.filtering && AppUtility.isNotEmpty(this.info.filterBy.Query)
			? AppUtility.toANSI(this.info.filterBy.Query).trim().toLowerCase()
			: "";
		var filterByCategory = this.info.filterBy.And.Category.Equals != "";
		var filterByAuthor = this.info.filterBy.And.Author.Equals != "";

		if (query != "" || filterByCategory || filterByAuthor) {
			books = books.Where(b => {
				return (query != "" ? AppUtility.indexOf(b.ANSITitle, query) > -1 : true)
					&& (filterByCategory ? AppUtility.indexOf(b.Category, this.info.filterBy.And.Category.Equals) == 0 : true)
					&& (filterByAuthor ? b.Author == this.info.filterBy.And.Author.Equals : true);
			});
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

		// pagination
		pageNumber = pageNumber || this.info.pageNumber;
		if (onepage) {
			if (pageNumber > 1) {
				books = books.Skip((pageNumber - 1) * this.info.pagination.PageSize);
			}
			books = books.Take(this.info.pagination.PageSize);
		}
		else if (!this.info.filtering) {
			books = books.Take(pageNumber * this.info.pagination.PageSize);
		}

		// return the array of books
		return books.ToArray();
	}

	search(onPreCompleted?: () => void, onPostCompleted?: () => void) {
		var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, r => {
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
			this.build("down", onPreCompleted, onPostCompleted);
		});
	}
	
	build(direction: string = "down", onPreCompleted?: () => void, onPostCompleted?: () => void) {
		// pre handler
		onPreCompleted != undefined && onPreCompleted();
		
		// books
		/*
		if (direction == "up") {
			let books = new Array<AppModels.Book>();
			if (this.info.pageNumber > 1) {
				books = this.get(true, this.info.pageNumber - 1).concat(books);
			}
			if (this.info.pageNumber > 2) {
				books = this.get(true, this.info.pageNumber - 2).concat(books);
			}
			this.books = new List(books.concat(this.books)).Distinct().ToArray();
			AppUtility.setTimeout(() => {
				if (this.books.length > this.info.displayPages * this.info.pagination.PageSize) {
					AppUtility.splice(this.books, this.books.length - (this.info.displayPages * this.info.pagination.PageSize));
				}
			}, 678);
		}
		else {
			this.books = this.books.concat(this.get());
			AppUtility.setTimeout(() => {
				if (this.books.length > this.info.displayPages * this.info.pagination.PageSize) {
					this.books.splice(0, this.books.length - (this.info.displayPages * this.info.pagination.PageSize));
				}
			}, 678);
		}
		*/
		this.books = this.get(false);
		
		// ratings & stocks
		new List(this.books).ForEach(b => {
			if (!this.ratings[b.ID]) {
				let rating = b.RatingPoints.getValue("General");
				this.ratings[b.ID] = rating != undefined ? rating.Average : 0;
			}
		});

		// post handler
		onPostCompleted != undefined && onPostCompleted();
		AppUtility.trackPageView({ page: this.info.pageNumber });
	}

	// actions
	trackBy(index: number, book: AppModels.Book) {
		return book.ID;
	}

	openBook(book: AppModels.Book) {
		this.navCtrl.push(ReadBookPage, { ID: book.ID, Refs: "Surf", FilterBy: this.info.filterBy });
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
					this.build();
				}
			});
		}

		if (this.authSvc.isModerator("book")) {
			actionSheet.addButton({
				text: "Lấy dữ liệu",
				icon: this.info.isAppleOS ? undefined : "build",
				handler: () => {
					this.showCrawl();
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

	showFilter() {
		this.info.filtering = true;
		AppUtility.focus(this.searchBarCtrl, this.keyboard);
	}

	showSorts() {
		var alert = this.alertCtrl.create({
			title: "Sắp xếp theo",
			enableBackdropDismiss: true,
			buttons: [
			{
				text: "Huỷ",
				role: "cancel"
			},
			{
				text: "Đặt",
				handler: (sortBy: string) => {
					this.onSort(sortBy);
				}
			}]
		});

		new List(this.sorts).ForEach(o => alert.addInput({ type: "radio", label: o.label, value: o.value, checked: this.info.sortBy == o.value}));
		alert.present();
	}

	showCrawl() {
		this.alertCtrl.create({
			title: "Crawl",
			message: "Url nguồn dữ liệu",
			enableBackdropDismiss: true,
			inputs: [{
				type: "text",
				name: "SourceUrl",
				placeholder: "Url nguồn dữ liệu",
				value: ""
			}],
			buttons: [{
				text: "Huỷ",
			},
			{
				text: "Lấy dữ liệu",
				handler: (data) => {
					AppRTU.call("books", "crawl", "GET", {
						"url": data.SourceUrl
					});
					this.alertCtrl.create({
						title: "Hoàn thành",
						message: "Đã gửi yêu cầu lấy dữ liệu!",
						enableBackdropDismiss: true,
						buttons: [{
							text: "Đóng"
						}]
					}).present();
				}
			}]
		}).present();
	}

	// event handlers
	onFilter() {
		this.books = this.get(false);
	}

	onCancel() {
		this.info.filterBy.Query = "";

		var request = AppData.buildRequest(this.info.filterBy, undefined, this.info.pagination, r => {
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Category.Equals)) {
				r.FilterBy.And.Category.Equals = undefined;
			}
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Author.Equals)) {
				r.FilterBy.And.Author.Equals = undefined;
			}
		});
		this.info.pagination = AppData.Paginations.get(request, "B");

		this.info.pageNumber = 1;
		this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
		this.books = this.get();

		AppUtility.setTimeout(() => {
			this.info.filtering = false;
		}, 234);
	}

	onSort(sortBy: string) {
		if (this.info.sortBy == sortBy) {
			return;
		}

		this.info.processing = true;
		this.info.sortBy = sortBy;
		this.contentCtrl.scrollTo(0, this.info.offset / 2).then(() => {
			this.info.pageNumber = 1;
			this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
			this.books = this.get();
			AppUtility.setTimeout(() => {
				this.info.processing = false;
			}, 234);
		});
	}

	// handle the scroll
	onInfiniteScroll(infiniteScroll: InfiniteScroll) {
		if (this.info.filtering) {
			infiniteScroll.complete();
		}
		else if (!this.info.processing) {
			// update state
			this.info.processing = true;

			/*
			// scroll up
			if (infiniteScroll._position != "bottom") {
				this.info.pageNumber = this.info.pageNumber > this.info.displayPages
					? this.info.pageNumber - 1
					: this.info.displayPages;
				this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				
				this.build("up",
					() => { },
					() => {
						infiniteScroll.complete();
						this.info.processing = false;
					}
				);
			}

			// scroll down
			else {
				// data is avalable
				if (this.info.pageNumber < this.info.pagination.PageNumber) {
					this.info.pageNumber++;
					this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
					
					this.build("down",
						() => {
							if (AppUtility.isAppleSafari()) {
								this.scrollDown();
							}
						},
						() => {
							infiniteScroll.complete();
							this.info.processing = false;
						}
					);
				}

				// data is not available, then search next page
				else if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
					this.search(
						() => {
							if (AppUtility.isAppleSafari()) {
								this.scrollDown();
							}
						},
						() => {
							infiniteScroll.complete();
							this.info.processing = false;
						}
					);
				}

				// all data are fetched
				else {
					infiniteScroll.complete();
					this.info.processing = false;
				}
			}
			*/

			// data is avalable
			if (this.info.pageNumber < this.info.pagination.PageNumber) {
				this.info.pageNumber++;
				this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				
				this.build("down",
					() => { },
					() => {
						infiniteScroll.complete();
						this.info.processing = false;
					}
				);
			}

			// data is not available, then search next page
			else if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
				this.search(
					() => { },
					() => {
						infiniteScroll.complete();
						this.info.processing = false;
					}
				);
			}

			// all data are fetched
			else {
				infiniteScroll.complete();
				this.info.processing = false;
			}
		}
	}

	scrollDown() {
		try {
			if (this.info.pageNumber > this.info.displayPages) {
				this.contentCtrl.scrollTo(0, this.contentCtrl.scrollTop - (this.info.offset * this.info.pagination.PageSize), 567);
			}
		}
		catch (e) { }
	}

}