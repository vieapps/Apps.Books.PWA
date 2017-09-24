import { Component, ViewChild } from "@angular/core";
import { NavController, NavParams, ActionSheetController, Content, Loading, LoadingController, Platform, MenuController } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts"; 

import { AppUtility } from "../../../helpers/utility";
import { AppEvents } from "../../../helpers/events";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { ConfigurationService } from "../../../providers/configuration";
import { AuthenticationService } from "../../../providers/authentication";
import { BooksService } from "../../../providers/books";

import { SurfBooksPage } from "../surf/surf";
import { BookInfoPage } from "../info/info";
import { ReadingOptionsPage } from "../options/options";

@Component({
	selector: "page-read-book",
	templateUrl: "read.html"
})
export class ReadBookPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public menuCtrl: MenuController,
		public actionSheetCtrl: ActionSheetController,
		public keyboard: Keyboard,
		public platform: Platform,
		public loadingCtrl: LoadingController,
		public configSvc: ConfigurationService,
		public authSvc: AuthenticationService,
		public booksSvc: BooksService
	){
	}

	// attributes
	info = {
		book: new AppModels.Book(),
		title: "Loading...",
		rating: 0.0,
		chapter: 0,
		offset: 0,
		isAppleOS: AppUtility.isAppleOS()
	};
	options = {
		color: AppData.Configuration.reading.options.color,
		style: AppData.Configuration.reading.options.font + " " + AppData.Configuration.reading.options.size + " " + AppData.Configuration.reading.options.paragraph + " " + AppData.Configuration.reading.options.align
	};

	// controls
	@ViewChild(Content) contentCtrl: Content;
	loading: Loading = undefined;
	
	// page events
	ionViewDidLoad() {
		this.showLoading();

		var id = this.navParams.get("ID") as string;
		var chapter = this.navParams.get("Chapter");
		if (AppData.Books.containsKey(id)) {
			this.info.book = AppData.Books.getValue(id);
		}

		this.booksSvc.getAsync(
			id,
			() => {
				this.info.book = AppData.Books.getValue(id);
				this.info.chapter = chapter as number || 0;
				this.prepare();
			},
			() => {
				this.hideLoading();
			}
		);

		AppEvents.on(
			"OpenChapter",
			(info: any) => {
				if (this.info.book.ID == info.args.ID) {
					this.goChapter(info.args.Chapter as number);
				}
			},
			"OpenBookChapterEventHandler"
		);

		AppEvents.on(
			"ReadingOptionsAreUpdated",
			(info: any) => {
				this.options = {
					color: AppData.Configuration.reading.options.color,
					style: AppData.Configuration.reading.options.font + " " + AppData.Configuration.reading.options.size + " " + AppData.Configuration.reading.options.paragraph + " " + AppData.Configuration.reading.options.align
				};
			},
			"UpdateReadingOptionsEventHandler"
		);
	}

	ionViewDidLeave() {
		AppEvents.off("OpenChapter", "OpenBookChapterEventHandler");
		AppEvents.off("ReadingOptionsAreUpdated", "UpdateReadingOptionsEventHandler");
		AppEvents.broadcast("CloseBook", { ID: this.info.book.ID });
	}

	// prepare
	prepare() {
		this.info.title = this.info.book.Title + " - " + this.info.book.Author;

		var rating = this.info.book.RatingPoints.getValue("General");
		this.info.rating = rating != undefined ? rating.Average : 0.0;

		if (this.info.chapter == 0) {
			let bookmark = AppData.Configuration.reading.bookmarks.getValue(this.info.book.ID);
			if (bookmark != undefined) {
				this.info.chapter = bookmark.Chapter;
				this.info.offset = bookmark.Position;
			}
		}

		if (this.info.chapter > 0) {
			this.goChapter(this.info.chapter);
		}
		else if (this.info.book.TotalChapters > 1 && this.info.chapter < this.info.book.TotalChapters) {
			this.hideLoading();
			this.booksSvc.fetchChapterAsync(this.info.book.ID, this.info.chapter + 1);
			AppEvents.broadcast("OpenBook", { ID: this.info.book.ID, Chapter: this.info.chapter });
		}
		else {
			this.hideLoading();
		}
	}

	// go to a specified chapter
	goChapter(chapter: number) {
		if (chapter < 1) {
			this.info.chapter = 0;
		}
		else if (chapter > this.info.book.TotalChapters) {
			this.info.chapter = this.info.book.TotalChapters;
		}
		else {
			this.info.chapter = chapter;
		}

		if (this.info.chapter > 0) {
			if (this.info.book.Chapters[this.info.chapter - 1] == "") {
				this.showLoading();
				this.booksSvc.getChapterAsync(this.info.book.ID, this.info.chapter, () => {
					this.info.title = this.info.book.Title + " - " + this.info.book.TOCs[this.info.chapter - 1];
					AppUtility.setTimeout(async () => {
						await this.scrollAsync(() => {
							this.hideLoading();
							AppEvents.broadcast("OpenBook", { ID: this.info.book.ID, Chapter: this.info.chapter });
							this.booksSvc.fetchChapterAsync(this.info.book.ID, this.info.chapter + 1);
						});
					});
				});
			}
			else {
				this.info.title = this.info.book.Title + " - " + this.info.book.TOCs[this.info.chapter - 1];
				AppUtility.setTimeout(async () => {
					await this.scrollAsync(() => {
						this.hideLoading();
						AppEvents.broadcast("OpenBook", { ID: this.info.book.ID, Chapter: this.info.chapter });
						this.booksSvc.fetchChapterAsync(this.info.book.ID, this.info.chapter + 1);
					});
				});
			}
		}
		else {
			this.info.title = this.info.book.Title + " - " + this.info.book.Author;
			AppUtility.setTimeout(async () => {
				await this.scrollAsync(() => {
					AppEvents.broadcast("OpenBook", { ID: this.info.book.ID, Chapter: this.info.chapter });
					this.contentCtrl.scrollTop = 0;
					this.onEndScroll();
				});
			});
		}
	}

	// event handlers
	goPrevious() {
		this.info.offset = 0;
		if (this.info.book.TotalChapters > 1) {
			this.goPreviousChapter();
		}
		else {
			this.goPreviousBook();
		}
	}

	goNext() {
		this.info.offset = 0;
		if (this.info.book.TotalChapters > 1) {
			this.goNextChapter();
		}
		else {
			this.goNextBook();
		}
	}

	goPreviousChapter() {
		this.goChapter(this.info.chapter - 1);
	}

	goNextChapter() {
		this.goChapter(this.info.chapter + 1);
	}

	goPreviousBook() {
		this.showLoading();
		this.goBook(this.getBook(true));
	}

	goNextBook() {
		this.showLoading();
		this.goBook(this.getBook(false));
	}

	goBook(book: AppModels.Book) {
		this.hideLoading();
		if (book != undefined) {
			this.info.book = book;
			this.info.chapter = 0;
			this.prepare();
		}
	}

	getBook(isPrevious: boolean) {
		var books = new List(AppData.Books.values());
		var index = books
			.Where(b => b.ID == this.info.book.ID)
			.Select((b, index) => index)
			.FirstOrDefault();
		return index != undefined && index > 0 && index < books.Count() - 1
			? books.FirstOrDefault((b, index) => index == (isPrevious ? index - 1 : index + 1))
			: undefined;
	}

	showInfo() {
		this.navCtrl.push(BookInfoPage, { ID: this.info.book.ID });
	}

	showOptions() {
		this.navCtrl.push(ReadingOptionsPage);
	}

	onEndScroll() {
		(this.info.book.TotalChapters > 1 || this.info.book.Body != "")  && AppUtility.setTimeout(async () => {
			await this.configSvc.updateBookmarksAsync(this.info.book.ID, this.info.chapter, this.contentCtrl.scrollTop);
		});
	}

	showActions() {
		var actionSheet = this.actionSheetCtrl.create({
			enableBackdropDismiss: true,
			buttons: [
				{
					text: "Cùng tác giả",
					icon: this.info.isAppleOS ? undefined : "search",
					handler: () => {
						AppEvents.broadcast("OpenPage", { component: SurfBooksPage, params: { Author: this.info.book.Author } });
					}
				},
				{
					text: "Thông tin",
					icon: this.info.isAppleOS ? undefined : "information-circle",
					handler: () => {
						this.showInfo();
					}
				}				
			]
		});

		if (this.info.book.TOCs.length > 1 && this.platform.width() < 992) {
			actionSheet.addButton({
				text: "Mục lục",
				icon: this.info.isAppleOS ? undefined : "list",
				handler: () => {
					this.menuCtrl.open();
				}
			});
		}

		actionSheet.addButton({
			text: "Tuỳ chọn đọc",
			icon: this.info.isAppleOS ? undefined : "options",
			handler: () => {
				this.showOptions();
			}
		});

		if (this.authSvc.isModerator("book")) {
			actionSheet.addButton({
				text: "Cập nhật",
				icon: this.info.isAppleOS ? undefined : "create",
				handler: () => {

				}
			});
			actionSheet.addButton({
				text: "Xoá",
				icon: this.info.isAppleOS ? undefined : "trash",
				handler: () => {

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

	showLoading() {
		if (this.loading == undefined) {
			this.loading = this.loadingCtrl.create({
				content: "Tải dữ liệu...."
			});
			this.loading.present();
		}
	}

	hideLoading() {
		if (this.loading != undefined) {
			this.loading.dismiss();
			this.loading = undefined;
		}
	}

	async scrollAsync(onCompleted?: () => void) {
		await this.contentCtrl.scrollTo(0, this.info.offset);
		onCompleted != undefined && onCompleted();
	}

}