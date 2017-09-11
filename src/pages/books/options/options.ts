import { Component } from "@angular/core";
import { NavController, NavParams } from "ionic-angular";

import { AppEvents } from "../../../helpers/events";
import { AppData } from "../../../models/data";

import { ConfigurationService } from "../../../providers/configuration";

@Component({
	selector: "page-book-options",
	templateUrl: "options.html"
})
export class ReadingOptionsPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public configSvc: ConfigurationService
	){
	}

	// attributes
	info = {
		title: "Tuỳ chọn đọc",
		options: AppData.Configuration.reading.options
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

	// events
	ionViewWillUnload() {
		window.setTimeout(async () => {
			await this.configSvc.saveOptionsAsync(() => {
				AppEvents.broadcast("ReadingOptionsAreUpdated");
			});
		});
	}

}