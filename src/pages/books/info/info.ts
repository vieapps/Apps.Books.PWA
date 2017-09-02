import { Component } from "@angular/core";
import { NavController, NavParams, AlertController, ModalController } from "ionic-angular";

import { AppUtility } from "../../../helpers/utility";
import { AppAPI } from "../../../helpers/api";
import { AppEvents } from "../../../helpers/events";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { AuthenticationService } from "../../../providers/authentication";
import { BooksService } from "../../../providers/books";

@Component({
	selector: "page-book-info",	
	templateUrl: "info.html"
})
export class BookInfoPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public alertCtrl: AlertController,
		public modalCtrl: ModalController,
		public authSvc: AuthenticationService,
		public booksSvc: BooksService
	){
	}

	// attributes
	info = {
		book: new AppModels.Book(),
		title: "Loading...",
		rating: 0.0,
		limit: 260,
		uri: "",
		qrcode: "",
		processByApp: AppUtility.isNativeApp()
	};

	// events
	ionViewDidLoad() {
		var id = this.navParams.get("ID") as string;
		var existed = AppData.Books.containsKey(id);
			
		if (existed) {
			this.prepare();
		}
		else {
			this.booksSvc.getAsync(id, () => {
				this.prepare();
			});
		}

		AppEvents.on(
			"BookStatisticsAreUpdated",
			(info: any) => {
				if (this.info.book != undefined && this.info.book.ID == info.args.ID) {
					this.prepare();
				}
			},
			"EventHandlerToUpdateBookStatistics"
		);
	}

	ionViewWillUnload() {
		AppEvents.off("BookStatisticsAreUpdated", "EventHandlerToUpdateBookStatistics");
	}

	prepare() {
		var id = this.navParams.get("ID") as string;
		this.info.book = AppData.Books.getValue(id);
		this.info.title = "Thông tin: " + this.info.book.Title;

		var rating = this.info.book.RatingPoints.getValue("General");
		this.info.rating = rating != undefined
			? rating.Average
			: 0.0;

		this.info.uri = AppUtility.getUri() + "#?book=" + AppUtility.getBase64UrlParam({ ID: this.info.book.ID });
		this.info.qrcode = this.info.processByApp
			? "vieapps-ebooks://" + this.info.book.ID
			: this.info.uri;
		console.info("INFO", this.info);
	}

	download(type: string) {
		if (this.authSvc.isAuthenticated()) {
			window.open(AppData.Configuration.api + this.info.book.Files[type].Uri + "?" + AppUtility.getQuery(AppAPI.getAuthHeaders()));
		}
		else {
			this.showAlert("Chú ý", "Cần đăng nhập để có thể tải được file e-book");
		}
	}

	showAlert(title: string, message: string, button?: string, handler?: () => void) {
		this.alertCtrl.create({
			title: title,
			message: message,
			enableBackdropDismiss: true,
			buttons: [{
				text: button != undefined ? button : "Đóng",
				handler: () => {
					if (handler != undefined) {
						handler();
					}
				}
			}]
		}).present();
	}

}