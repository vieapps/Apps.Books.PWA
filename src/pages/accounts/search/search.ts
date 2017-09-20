import { Component, ViewChild } from "@angular/core";
import { NavController, NavParams, ActionSheetController, AlertController, Searchbar, InfiniteScroll } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { List } from "linqts";

import { AppUtility } from "../../../helpers/utility";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { AuthenticationService } from "../../../providers/authentication";
import { AccountsService } from "../../../providers/accounts";

import { ProfilePage } from "../profile/profile";

@Component({
	selector: "page-search-accounts",
	templateUrl: "search.html"
})
export class SearchProfilesPage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public actionSheetCtrl: ActionSheetController,
		public alertCtrl: AlertController,
		public keyboard: Keyboard,
		public authSvc: AuthenticationService,
		public accountsSvc: AccountsService
	){
	}

	// attributes
	info = {
		filterBy: {
			Query: "",
			And: {
				Province: {
					Equals: undefined
				}
			}
		},
		sortBy: "",
		pagination: AppData.Paginations.default(),
		state: {
			searching: false,
			filtering: false,
			cancel: "Đóng",
			holder: "Search"
		},
		title: "Tài khoản người dùng",
		totalRecords: 0,
		pageNumber: 0,
		isAppleOS: AppUtility.isAppleOS()
	};
	sorts: Array<any> = [];
	accounts: Array<AppModels.Account> = undefined;
	ratings = {};

	// controls
	@ViewChild(Searchbar) searchBarCtrl: Searchbar;
	infiniteScrollCtrl: InfiniteScroll = undefined;

	// page events
	ionViewDidLoad() {
		this.sorts = [
			{
				label: "Tên (A - Z)",
				value: "Name"
			},
			{
				label: "Mới truy cập",
				value: "LastAccess"
			},
			{
				label: "Mới đăng ký",
				value: "Registered"
			}
		];
		this.info.sortBy = this.sorts[0].value;

		this.info.filterBy.Query = this.navParams.get("Query");
		this.info.filterBy.And.Province.Equals = this.navParams.get("Province");
		this.info.filterBy.And.Province.Equals = this.info.filterBy.And.Province.Equals || "";
}

	ionViewCanEnter() {
		return this.authSvc.isAdministrator();
	}

	ionViewDidEnter() {
		if (this.accounts == undefined) {
			
			var request = AppData.buildRequest(this.info.filterBy, undefined, AppUtility.isNotEmpty(this.info.filterBy.Query) ? undefined : this.info.pagination, r => {
				if (!AppUtility.isNotEmpty(r.FilterBy.And.Province.Equals)) {
					r.FilterBy.And.Province.Equals = undefined;
				}
			});
			this.info.pagination = AppData.Paginations.get(request, "A");

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
		}
	}

	// search & build the listing of account profiles
	doSearch(onCompleted?: () => void) {
		var request = AppData.buildRequest(this.info.filterBy, undefined, AppUtility.isNotEmpty(this.info.filterBy.Query) ? undefined : this.info.pagination, r => {
			if (!AppUtility.isNotEmpty(r.FilterBy.And.Province.Equals)) {
				r.FilterBy.And.Province.Equals = undefined;
			}
		});
		this.accountsSvc.search(request,
			(data?: any) => {
				this.info.pagination = this.info.state.searching && data != undefined
					? AppData.Paginations.default(data.Data)
					: AppData.Paginations.get(request, "A");

				if (!this.info.state.searching && !this.info.state.filtering) {
					this.info.pageNumber = this.info.pagination.PageNumber;
					this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				}

				this.doBuild(this.info.state.searching && data != undefined ? data.Data.Objects : undefined);
				onCompleted != undefined && onCompleted();
			}
		);
	}

	doBuild(searchResults?: Array<AppModels.Account>) {
		// initialize the list
		var accounts = new List(
			searchResults != undefined
				? searchResults
				: AppData.Accounts.values()
			);

		// apply filter-by
		if (this.info.state.filtering && AppUtility.isNotEmpty(this.info.filterBy.Query)) {
			let query = AppUtility.toANSI(this.info.filterBy.Query).trim().toLowerCase();
			accounts = accounts.Where(a => AppUtility.indexOf(a.Title, query) > -1);
		}

		// transform
		if (searchResults != undefined) {
			accounts = accounts.Select(a => AppModels.Account.deserialize(a));
		}

		// apply order-by
		switch (this.info.sortBy) {
			case "LastAccess":
				accounts = accounts.OrderByDescending(a => a.LastAccess).ThenBy(a => a.Name);
				break;

			case "Joined":
				accounts = accounts.OrderByDescending(a => a.Joined).ThenBy(a => a.Name);
				break;

			default:
				accounts = accounts.OrderBy(a => a.Name).ThenByDescending(a => a.LastAccess);
				break;
		}

		// paging
		if (!this.info.state.searching && !this.info.state.filtering && this.info.pageNumber > 0) {
			accounts = accounts.Take(this.info.pageNumber * (this.info.pagination != undefined ? this.info.pagination.PageSize : 20));
		}

		// convert the list of results to array
		this.accounts = accounts.ToArray();

		// prepare ratings
		new List(this.accounts).ForEach((a) => {
			if (!this.ratings[a.ID]) {
				let rating = a.RatingPoints.getValue("General");
				this.ratings[a.ID] = rating != undefined ? rating.Average : 0;
			}
		});
	}

	trackBy(index: number, account: AppModels.Account) {
		return account.ID;
	}

	// event handlers
	onInfiniteScroll(infiniteScroll: any) {
		// capture
		if (this.infiniteScrollCtrl == undefined) {
			this.infiniteScrollCtrl = infiniteScroll;
		}

		// searching
		if (this.info.state.searching && AppUtility.isNotEmpty(this.info.filterBy.Query)) {
			if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
				this.doSearch(() => {
					this.infiniteScrollCtrl.complete();
				});
			}
			else {
				this.infiniteScrollCtrl.complete();
				this.infiniteScrollCtrl.enable(false);
			}
		}

		// filtering
		else if (this.info.state.filtering) {
			this.infiniteScrollCtrl.complete();
			this.infiniteScrollCtrl.enable(false);
		}

		// surfing
		else {
			if (this.info.pageNumber < this.info.pagination.PageNumber) {
				this.info.pageNumber++;
				this.info.totalRecords = AppData.Paginations.computeTotal(this.info.pageNumber, this.info.pagination);
				this.doBuild();
				this.infiniteScrollCtrl.complete();
			}
			else if (this.info.pagination.PageNumber < this.info.pagination.TotalPages) {
				this.doSearch(() => {
					this.infiniteScrollCtrl.complete();
				});
			}
			else {
				this.infiniteScrollCtrl.complete();
				this.infiniteScrollCtrl.enable(false);
			}
		}
	}

	onSearch() {
		if (this.info.state.searching) {
			this.accounts = [];
			if (AppUtility.isNotEmpty(this.info.filterBy.Query)) {
				this.doSearch();
			}
		}
		else {
			this.doBuild();
		}
	}

	onCancel() {
		this.info.state.searching = false;
		this.info.state.filtering = false;
		this.info.filterBy.Query = "";

		this.info.pagination = AppData.Paginations.get(AppData.buildRequest(this.info.filterBy, null, this.info.pagination), "A");
		this.doBuild();

		if (this.infiniteScrollCtrl != undefined) {
			this.infiniteScrollCtrl.enable(true);
		}
	}

	// helpers
	getAvatar(account: AppModels.Account) {
		return AppUtility.getAvatarImage(account);
	}

	openProfile(account: AppModels.Account) {
		this.navCtrl.push(ProfilePage, { ID: account.ID });
	}

	showSearch() {
		this.accounts = [];
		this.info.pagination = null;
		this.info.state.searching = true;
		this.info.state.holder = "Tìm kiếm (không dấu cũng OK)";
		AppUtility.focus(this.searchBarCtrl, this.keyboard);
	}

	showActions() {
		var actionSheet = this.actionSheetCtrl.create({
			enableBackdropDismiss: true,
			buttons: [
				{
					text: "Tìm kiếm",
					icon: this.info.isAppleOS ? undefined : "search",
					handler: () => {
						this.showSearch();
					}
				},
				{
					text: "Lọc/Tìm nhanh",
					icon: this.info.isAppleOS ? undefined : "funnel",
					handler: () => {
						this.info.state.filtering = true;
						this.info.state.holder = "Tìm nhanh (không dấu cũng OK)";
						AppUtility.focus(this.searchBarCtrl, this.keyboard);
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
					text: "Huỷ",
					role: "cancel"
				},
				{
					text: "Đặt",
					handler: (sortBy: string) => {
						if (this.info.sortBy != sortBy) {
							this.info.sortBy = sortBy;
							this.doBuild();
						}
					}
				}
			]
		});

		new List<any>(this.sorts).ForEach(o => {
			alert.addInput({
				type: "radio",
				label: o.label,
				value: o.value,
				checked: this.info.sortBy == o.value
			});
		});

		alert.present();
	}

}