import { Component } from "@angular/core";
import { NavController, NavParams } from "ionic-angular";

import { AppEvents } from "../../../components/events";
import { AppUtility } from "../../../components/utility";
import { AppData } from "../../../models/data";

import { BooksService } from "../../../services/books";

@Component({
	selector: "page-book-options",
	templateUrl: "options.html"
})
export class ReadingOptionsPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public booksSvc: BooksService
	){
	}

	info = {
		title: "Tuỳ chọn đọc",
		options: AppData.Configuration.reading.options,
		uri: ""
	};
	options = {
		colors: [
			{
				label: "Trắng",
				value: "white"
			},
			{
				label: "Đen",
				value: "black"
			},
			{
				label: "Ngả vàng",
				value: "sepia"
			}
		],
		fonts: [
			{
				label: "Mặc định",
				value: "default"
			},
			{
				label: "Gần mặc định",
				value: "like-default"
			},
			{
				label: "Tròn",
				value: "plump"
			},
			{
				label: "Béo",
				value: "fat"
			},
			{
				label: "Khác lạ",
				value: "fancy"
			}
		],
		sizes: [
			{
				label: "Nhỏ nhất",
				value: "smallest"
			},
			{
				label: "Nhỏ hơn",
				value: "smaller"
			},
			{
				label: "Nhỏ",
				value: "small"
			},
			{
				label: "Trung bình",
				value: "normal"
			},
			{
				label: "To",
				value: "big"
			},
			{
				label: "To hơn",
				value: "bigger"
			},
			{
				label: "Rất là bự",
				value: "huge"
			}
		],
		paragraphs: [
			{
				label: "Bình thường",
				value: "one"
			},
			{
				label: "Thưa",
				value: "two"
			},
			{
				label: "Rất thưa",
				value: "three"
			}
		],
		aligns: [
			{
				label: "Trái",
				value: "align-left"
			},
			{
				label: "Đều hai bên",
				value: "align-justify"
			},
			{
				label: "Phải",
				value: "align-right"
			}
		]
	};

	ionViewDidLoad() {
		this.info.uri = window.location.href;
		AppUtility.resetUri({ "reading-options": undefined });
		AppUtility.trackPageView(this.info.title, "reading-options");
	}

	ionViewWillLeave() {
		window.location.href = this.info.uri;
		AppUtility.setTimeout(async () => {
			await this.booksSvc.saveOptionsAsync(() => {
				AppUtility.isDebug() && console.warn("<ReadingOptions>: The options are saved");
				AppEvents.broadcast("ReadingOptionsAreUpdated");
			});
		});
	}

}