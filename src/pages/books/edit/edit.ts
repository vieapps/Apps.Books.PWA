import { Component, ViewChild, ElementRef } from "@angular/core";
import { Http } from "@angular/http";
import { NgForm } from "@angular/forms";
import { NavController, NavParams, AlertController, TextInput } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts"; 

import { AppUtility } from "../../../components/utility";
import { AppAPI } from "../../../components/api";
import { AppData } from "../../../models/data";

import { ConfigurationService } from "../../../services/configuration";
import { BooksService } from "../../../services/books";

@Component({
	selector: "page-edit-book",	
	templateUrl: "edit.html"
})
export class EditBookPage {
	constructor(
		public http: Http,
		public navCtrl: NavController,
		public navParams: NavParams,
		public alertCtrl: AlertController,
		public keyboard: Keyboard,
		public configSvc: ConfigurationService,
		public booksSvc: BooksService
	){
	}

	// attributes
	info = {
		title: "Cập nhật",
		name: "",
		state: {
			processing: false,
			valid: true
		},
		categories: new Array<string>(),
		book: {
			Title: "",
			Original: "",
			Author: "",
			Translator: "",
			Publisher: "",
			Producer: "",
			Category: "",
			TOCs: "",
			Cover: ""
		},
		cover: {
			uri: "",
			image: null,
			uploaded: ""
		}
	};
	@ViewChild("Title") titleCtrl: TextInput;
	@ViewChild("Author") authorCtrl: TextInput;
	@ViewChild("Cover") coverCtrl: ElementRef;

	// events
	ionViewDidLoad() {
		let book = AppData.Books.getValue(this.navParams.get("ID") as string);
		this.info.book = AppUtility.clone(book);
		this.info.book.TOCs = "";
		new List(book.TOCs).ForEach(toc => this.info.book.TOCs += (this.info.book.TOCs != "" ? "\n" : "") + toc);
		this.info.categories = new List(AppData.Statistics.Categories)
			.Select(c => c.Name)
			.ToArray();
		this.info.cover.uri = book.Cover;

		this.info.name = book.ANSITitle.replace(/\s/g, "-");
		AppUtility.resetUri({ "edit-book": AppUtility.getBase64UrlParam({ ID: book.ID }), name: this.info.name });
		AppUtility.trackPageView(book.Title, "edit-book/" + this.info.name);
	}

	ionViewDidEnter() {
		AppUtility.focus(this.titleCtrl, this.keyboard, 234);
	}

	ionViewWillUnload() {
	}

	cancel() {
		this.navCtrl.pop();
	}

	update(form: NgForm) {
		this.info.state.valid = this.isValidInfo(form);
		if (this.info.state.valid) {
			this.info.state.valid = true;
			if (this.info.cover.image) {
				this.uploadCover(() => {
					this.updateBook();
				})
			}
			else {
				this.updateBook();
			}
		}
	}

	updateBook() {
		this.info.state.processing = true;
		this.booksSvc.updateAsync(
			{
				ID: this.navParams.get("ID") as string,
				Title: this.info.book.Title,
				Original: this.info.book.Original,
				Author: this.info.book.Author,
				Translator: this.info.book.Translator,
				Publisher: this.info.book.Publisher,
				Producer: this.info.book.Producer,
				Category: this.info.book.Category,
				TOCs: this.info.book.TOCs,
				Cover: this.info.cover.uploaded
			},
			() => {
				this.cancel();
			},
			(data) => {
				this.showError(data);
			}
		);
	}

	isEmpty(value: string) {
		return !AppUtility.isNotEmpty(value);
	}

	isValidInfo(form: NgForm) {
		if (!form.valid) {
			if (!form.controls.Title.valid) {
				AppUtility.focus(this.titleCtrl, this.keyboard);
			}
			else if (!form.controls.Author.valid) {
				AppUtility.focus(this.authorCtrl, this.keyboard);
			}
			return false;
		}
		else {
			return form.valid;
		}
	}
	
	uploadCover(onCompleted?: () => void) {
		this.http.post(
			AppData.Configuration.app.uris.files + "books",
			JSON.stringify({ "Data": this.info.cover.image }),
			{
				headers: AppAPI.getHeaders({
					"content-type": "application/json",
					"x-as-base64": "yes",
					"x-book-id": this.navParams.get("ID") as string
				})
			}
		)
		.map(response => response.json())
		.subscribe(
			(data: any) => {
				this.info.cover.uploaded = data.Uri;
				onCompleted && onCompleted();
			},
			(error: any) => {
				console.error("Error occurred while uploading cover image", error);
				onCompleted && onCompleted();
			}
		);
	}

	selectCover(event: any) {
		if (event.target.files && event.target.files[0]) {
			let reader = new FileReader();
			reader.onloadend = (loadEvent: any) => {
				this.info.cover.image = loadEvent.target.result;
			};
			reader.readAsDataURL(event.target.files[0]);
		}
		else {
			this.info.cover.image = null;
		}
	}

	removeCover() {
		this.info.cover.image = null;
	}

	showError(data: any) {
		this.info.state.processing = false;
		this.alertCtrl.create({
			title: "Lỗi",
			message: AppUtility.isObject(data.Error, true) ? data.Error.Message : "Đã xảy ra lỗi",
			enableBackdropDismiss: false,
			buttons: [{
				text: "Đóng",
			}]
		}).present();
	}

}