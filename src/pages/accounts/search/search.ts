import { Component, ViewChild } from "@angular/core";
import { NavController, NavParams, ActionSheetController, AlertController, Searchbar, InfiniteScroll } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts";

import { AppUtility } from "../../../components/utility";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { ConfigurationService } from "../../../services/configuration";
import { AuthenticationService } from "../../../services/authentication";

import { ProfilePage } from "../profile/profile";

@Component({
	selector: "search-accounts-page",
	templateUrl: "search.html"
})
export class SearchProfilesPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public actionSheetCtrl: ActionSheetController,
		public alertCtrl: AlertController,
		public keyboard: Keyboard,
		public configSvc: ConfigurationService,
		public authSvc: AuthenticationService
	){
	}

	// attributes
	info = {
		title: "Tài khoản người dùng",
		state: {
			processing: false,
			searching: false,
			filtering: false,
			searchingPlaceHolder: "Tìm kiếm"
		},
		filterBy: {
			Query: "",
			And: {
				Province: {
					Equals: undefined
				}
			}
		},
		sortBy: "",
		sorts: new Array<{ label: string, attribute: string, mode: string	}>(),
		pagination: AppData.Paginations.default(),
		totalRecords: 0,
		pageNumber: 0
	};
	items: Array<AppModels.Account> = undefined;
	ratings = {};

	// controls
	@ViewChild(Searchbar) searchBarCtrl: Searchbar;
	infiniteScrollCtrl: InfiniteScroll = undefined;

	// events
	ionViewDidLoad() {
		this.pageOnLoad();
	}

	ionViewCanEnter() {
		return this.authSvc.isSystemAdministrator();
	}

	ionViewDidEnter() {
		this.pageOnEnter();
	}

	pageOnLoad() {
		this.info.filterBy.Query = this.navParams.get("Query");
		this.info.filterBy.And.Province.Equals = this.navParams.get("Province") || "";
		this.info.sorts = [
			{
				label: "Tên (A - Z)",
				attribute: "Name",
				mode: "Ascending"
			},
			{
				label: "Mới truy cập",
				attribute: "LastAccess",
				mode: "Descending"
			},
			{
				label: "Mới đăng ký",
				attribute: "Joined",
				mode: "Descending"
			}
		];
		this.info.sortBy = this.info.sorts[0].attribute;
	}

	pageOnEnter() {
		// update state
		AppUtility.resetUri({ "search-accounts": undefined });
		AppUtility.trackPageView(this.info.title, "search-accounts");

		// search & show
		if (!this.items) {
			this.info.pagination = this.buildPagination();
			if (this.info.pagination) {
				if (this.info.pageNumber < 1) {
					this.info.pageNumber = 1;
					this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				}
				this.show();
			}
			else {
				this.search();
			}
		}
	}

	showActions() {
		let actions = this.actionSheetCtrl.create({
			enableBackdropDismiss: true,
			buttons: [
				AppUtility.getActionButton("Tìm kiếm", "search", () => {
					this.showSearch(true);
				}),
				AppUtility.getActionButton("Lọc/Tìm nhanh", "funnel", () => {
					this.showSearch(false);
				}),
				AppUtility.getActionButton("Thay đổi cách sắp xếp", "list-box", () => {
					this.showSorts();
				})
			]
		});

		if (this.info.pagination && this.info.pageNumber < this.info.pagination.PageNumber) {
			actions.addButton(
				AppUtility.getActionButton("Hiển thị toàn bộ " + AppData.Paginations.computeTotal(this.info.pagination.PageNumber, this.info.pagination) + " kết quả", "eye", () => {
					this.info.pageNumber = this.info.pagination.PageNumber;
					this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
					this.show();
				})
			);
		}

		actions.addButton(AppUtility.getActionButton("Huỷ bỏ", "close", undefined, "cancel"));
		actions.present();
	}

	showAlert(title: string, message: string, handler?: () => void) {
		this.alertCtrl.create({
			title: title,
			message: message,
			enableBackdropDismiss: false,
			buttons: [{
				text: "Đóng",
				handler: () => {
					handler != undefined && handler();
				}
			}]
		}).present();
	}

	showSearch(isSearching: boolean) {
		if (isSearching) {
			this.items = [];
			this.info.pagination = null;
			this.info.state.searching = true;
		}
		else {
			this.info.state.filtering = true;
		}
		this.info.state.searchingPlaceHolder = isSearching
			? "Tìm kiếm tài khoản người dùng (không dấu cũng OK)"
			: "Tìm nhanh tài khoản người dùng (không dấu cũng OK)";
		AppUtility.focus(this.searchBarCtrl, this.keyboard);
	}

	// search
	search(onCompleted?: () => void) {
		let request = this.buildRequest();
		this.configSvc.searchAccounts(request,
			data => {
				this.info.pagination = this.info.state.searching
					? AppData.Paginations.default(data)
					: this.buildPagination(request);

				if (!this.info.state.searching && !this.info.state.filtering) {
					this.info.pageNumber = this.info.pagination.PageNumber;
					this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				}

				this.show(this.info.state.searching ? data.Objects : undefined);
				onCompleted != undefined && onCompleted();
			}
		);
	}

	show(results?: Array<AppModels.Account>) {
		// initialize
		let items = new List(results || AppData.Accounts.values());
		if (results) {
			items = items.Select(obj => AppModels.Account.deserialize(obj));
		}

		// filter
		if (this.info.state.filtering && AppUtility.isNotEmpty(this.info.filterBy.Query)) {
			let query = AppUtility.toANSI(this.info.filterBy.Query).trim().toLowerCase();
			items = items.Where(a => AppUtility.indexOf(a.Title, query) > -1);
		}

		// sort
		let sortBy = new List<any>(this.info.sorts).FirstOrDefault(s => s.attribute == this.info.sortBy) || this.info.sorts[0].attribute;
		switch (sortBy.attribute) {
			case "LastAccess":
				items = sortBy.mode == "Descending"
					? items.OrderByDescending(obj => obj.LastAccess).ThenBy(obj => obj.Name)
					: items.OrderBy(obj => obj.LastAccess).ThenBy(obj => obj.Name);
				break;

			case "Joined":
				items = sortBy.mode == "Descending"
					? items.OrderByDescending(obj => obj.Joined).ThenBy(obj => obj.Name)
					: items.OrderBy(obj => obj.Joined).ThenBy(obj => obj.Name);
				break;

			default:
				items = sortBy.mode == "Descending"
					? items.OrderByDescending(obj => obj.Name).ThenByDescending(obj => obj.LastAccess)
					: items.OrderBy(obj => obj.Name).ThenByDescending(obj => obj.LastAccess);
				break;
		}

		// pagination
		if (!this.info.state.searching && !this.info.state.filtering && this.info.pageNumber > 0) {
			//items = items.Take(this.info.pageNumber * (this.info.pagination ? this.info.pagination.PageSize : 20));
		}

		// convert to array
		this.items = items.ToArray();
		
		// prepare ratings
		new List(this.items).ForEach(a => {
			if (!this.ratings[a.ID]) {
				let rating = a.RatingPoints.getValue("General");
				this.ratings[a.ID] = rating != undefined ? rating.Average : 0;
			}
		});
	}

	open(item: AppModels.Base) {
		this.navCtrl.push(ProfilePage, { ID: item.ID });
	}

	track(index: number, item: AppModels.Base) {
		return item.ID;
	}

	onScroll(infiniteScroll: any) {
		// capture
		if (this.infiniteScrollCtrl == undefined) {
			this.infiniteScrollCtrl = infiniteScroll;
		}

		// stop if on processing
		if (this.info.state.processing) {
			return;
		}

		// set state
		this.info.state.processing = true;

		// searching
		if (this.info.state.searching && AppUtility.isNotEmpty(this.info.filterBy.Query)) {
			if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
				this.search(() => {
					this.infiniteScrollCtrl.complete();
					this.info.state.processing = false;
				});
			}
			else {
				this.infiniteScrollCtrl.complete();
				this.infiniteScrollCtrl.enable(false);
				this.info.state.processing = false;
			}
		}

		// filtering
		else if (this.info.state.filtering) {
			this.infiniteScrollCtrl.complete();
			this.infiniteScrollCtrl.enable(false);
			this.info.state.processing = false;
		}

		// surfing
		else {
			if (this.info.pageNumber < this.info.pagination.PageNumber) {
				this.info.pageNumber++;
				this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				this.show();
				this.infiniteScrollCtrl.complete();
				this.info.state.processing = false;
			}
			else if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
				this.search(() => {
					this.infiniteScrollCtrl.complete();
					this.info.state.processing = false;
				});
			}
			else {
				this.infiniteScrollCtrl.complete();
				this.infiniteScrollCtrl.enable(false);
				this.info.state.processing = false;
			}
		}
	}

	onSearch(event: any) {
		if (this.info.state.searching) {
			this.items = [];
			AppUtility.isNotEmpty(this.info.filterBy.Query) && this.search();
		}
		else {
			this.show();
		}
	}

	onCancel() {
		this.info.state.processing = false;
		this.info.state.searching = false;
		this.info.state.filtering = false;
		this.info.filterBy.Query = "";
		this.info.pagination = this.buildPagination();
		this.show();

		if (this.infiniteScrollCtrl) {
			this.infiniteScrollCtrl.enable(true);
		}
	}

	// sort
	showSorts() {
		let ctrl = this.alertCtrl.create({
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
						this.sort(sortBy);
					}
				}
			]
		});

		new List<any>(this.info.sorts).ForEach(s => {
			ctrl.addInput({
				type: "radio",
				label: s.label,
				value: s.attribute,
				checked: this.info.sortBy == s.attribute
			});
		});

		ctrl.present();
	}

	sort(sortBy: string) {
		if (this.info.sortBy != sortBy) {
			this.info.sortBy = sortBy;
			this.show();
		}
	}

	// helpers
	buildRequest(sortBy?: any) {
		return AppData.buildRequest(
			this.info.filterBy,
			this.buildSortBy(sortBy),
			AppUtility.isNotEmpty(this.info.filterBy.Query)
				? undefined
				: this.info.pagination,
			r => {
				if (!AppUtility.isNotEmpty(r.FilterBy.And.Province.Equals)) {
					r.FilterBy.And.Province.Equals = undefined;
				}
			}
		);
	}

	buildSortBy(sortBy?: any) {
		if (!sortBy) {
			sortBy = {};
			sortBy[this.info.sorts[0].attribute] = this.info.sorts[0].mode;
		}
		return sortBy;
	}

	buildPagination(request?: any) {
		return AppData.Paginations.get(request || this.buildRequest(), "Accounts");
	}

	getAvatar(account: AppModels.Account) {
		return AppUtility.getAvatarImage(account);
	}

}