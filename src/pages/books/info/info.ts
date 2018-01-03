import { Component } from "@angular/core";
import { NavController, NavParams, AlertController } from "ionic-angular";

import { AppUtility } from "../../../components/utility";
import { AppAPI } from "../../../components/api";
import { AppEvents } from "../../../components/events";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { ConfigurationService } from "../../../services/configuration";
import { BooksService } from "../../../services/books";

@Component({
	selector: "page-book-info",	
	templateUrl: "info.html"
})
export class BookInfoPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public alertCtrl: AlertController,
		public configSvc: ConfigurationService,
		public booksSvc: BooksService
	){
	}

	// attributes
	info = {
		book: new AppModels.Book(),
		view: undefined as AppModels.CounterInfo,
		download: undefined as AppModels.CounterInfo,
		title: "Thông tin",
		rating: 0.0,
		uri: "",
		qrcode: "",
		processByApp: AppUtility.isNativeApp()
	};

	// events
	ionViewDidLoad() {
		// get info
		this.booksSvc.getAsync(
			this.navParams.get("ID") as string,
			() => {
				this.prepare(true);
			},
			undefined,
			true
		);

		// setup events
		AppEvents.on(
			"BookStatisticsAreUpdated",
			(info: any) => {
				if (this.info.book != undefined && this.info.book.ID == info.args.ID) {
					this.prepare();
				}
			},
			"EventHandlerToUpdateBookStatistics"
		);

		AppEvents.on(
			"BookFilesAreUpdated",
			(info: any) => {
				if (this.info.book != undefined && this.info.book.ID == info.args.ID) {
					this.prepare();
				}
			},
			"EventHandlerToUpdateBookFiles"
		);
	}

	ionViewWillUnload() {
		AppEvents.off("BookStatisticsAreUpdated", "EventHandlerToUpdateBookStatistics");
		AppEvents.off("BookFilesAreUpdated", "EventHandlerToUpdateBookFiles");
	}

	prepare(checkFiles?: boolean) {
		this.info.book = AppData.Books.getValue(this.navParams.get("ID") as string);
		this.info.view = this.info.book.Counters.getValue("View");
		this.info.download = this.info.book.Counters.getValue("Download");

		this.info.rating = this.info.book.RatingPoints.containsKey("General")
			? this.info.book.RatingPoints.getValue("General").Average
			: 0.0;

		this.info.uri = AppUtility.getUri() + "#?ebook=" + AppUtility.getBase64UrlParam({ ID: this.info.book.ID });
		this.info.qrcode = this.info.processByApp
			? "vieapps-ebooks://" + this.info.book.ID
			: this.info.uri;

		if (AppUtility.isTrue(checkFiles) && AppUtility.isObject(this.info.book.Files, true)
		&& (this.info.book.Files.Epub.Size == "generating..." || this.info.book.Files.Mobi.Size == "generating...")) {
			this.booksSvc.generateFiles(this.info.book.ID);
		}
	}

	download(type: string) {
		if (this.configSvc.isAuthenticated()) {
			AppUtility.openUri(this.info.book.Files[type].Url + "?" + AppUtility.getQuery(AppAPI.getAuthHeaders()));
		}
		else {
			this.showAlert("Chú ý", "Cần đăng nhập để có thể tải được e-book!");
		}
	}

	showAlert(title: string, message: string, button?: string, func?: () => void) {
		this.alertCtrl.create({
			title: title,
			message: message,
			enableBackdropDismiss: true,
			buttons: [{
				text: button != undefined ? button : "Đóng",
				handler: () => {
					func != undefined && func();
				}
			}]
		}).present();
	}

}