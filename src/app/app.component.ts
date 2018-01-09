import { Component, ViewChild } from "@angular/core";
import { Platform, MenuController, Nav, AlertController, Loading, LoadingController } from "ionic-angular";
import { StatusBar } from "@ionic-native/status-bar";
import { SplashScreen } from "@ionic-native/splash-screen";
import { Storage } from "@ionic/storage";
import { Device } from "@ionic-native/device";
import { AppVersion } from "@ionic-native/app-version";
import { GoogleAnalytics } from "@ionic-native/google-analytics";
import { List } from "linqts";

import { AppUtility } from "../components/utility";
import { AppEvents } from "../components/events";
import { AppRTU } from "../components/rtu";
import { AppData } from "../models/data";

import { ConfigurationService } from "../services/configuration";
import { AuthenticationService } from "../services/authentication";
import { BooksService } from "../services/books";
import { StatisticsService } from "../services/statistics";
import { ResourcesService } from "../services/resources";

import { HomePage } from "../pages/home/home";

import { SignInPage } from "../pages/accounts/signin/signin";
import { ProfilePage } from "../pages/accounts/profile/profile";
import { SearchProfilesPage } from "../pages/accounts/search/search";

import { SearchPage } from "../pages/search/search";
import { SurfBooksPage } from "../pages/books/surf/surf";
import { ReadBookPage } from "../pages/books/read/read";
import { AppModels } from "../models/objects";

@Component({
	templateUrl: "app.html"
})
export class App {
	// attributes
	info = {
		nav: {
			start: HomePage,
			previous: {
				name: "",
				component: undefined,
				params: undefined
			},
			active: {
				name: "HomePage",
				component: undefined,
				params: undefined
			}
		},
		title: {
			avatar: undefined as string,
			top: "Menu",
			main: "Chính",
			sub: "Thể loại"
		},
		category: {
			index: -1,
			parent: {
				index: -1,
				title: ""
			}
		},
		book: {
			id: "",
			title: "",
			chapter: 0
		},
		iPhoneX: false,
		attemps: 0
	};
	pages: Array<{ name: string, component: any, title: string, icon: string, params?: any, doPush?: boolean, popIfContains?: string, noNestedStack?: boolean }> = [];
	categories: Array<{ title: string, index: number, gotChildren?: boolean }> = [];
	chapters: Array<{ title: string, index: number }> = [];

	// controls
	@ViewChild(Nav) nav: Nav;
	loading: Loading = undefined;

	constructor(
		public platform: Platform,
		public device: Device,
		public appVersion: AppVersion,
		public ga: GoogleAnalytics,
		public menu: MenuController,
		public statusBar: StatusBar,
		public splashScreen: SplashScreen,
		public alertCtrl: AlertController,
		public loadingCtrl: LoadingController,
		public storage: Storage,
		public configSvc: ConfigurationService,
		public authSvc: AuthenticationService,
		public statisticsSvc: StatisticsService,
		public resourcesSvc: ResourcesService,
		public booksSvc: BooksService
	){
		// show loading
		this.loading = this.loadingCtrl.create({
			content: "Tải dữ liệu..."
		});
		this.loading.present();

		// setup event handlers
		this.setupEvents();

		// run initialize process when ready
		this.platform.ready().then(() => {			
			// iPhone X: footers need special paddings
			this.info.iPhoneX = this.device.platform != undefined && this.device.platform == "iOS"
				&& this.device.model != undefined && this.device.model != null
				&& AppUtility.indexOf(this.device.model, "iPhone1") == 0
				&& AppUtility.toInt(this.device.model.substring(this.device.model.length - 1)) > 2;

			// prepare status bar
			this.statusBar.styleDefault();
			if (this.info.iPhoneX) {
				this.statusBar.backgroundColorByHexString("f8f8f8");
			}
			this.statusBar.overlaysWebView(false);
			
			// hide the splash screen
			this.splashScreen.hide();
			
			// make sure the storage is ready
			this.storage.ready().then(() => {
				AppUtility.isDebug() && console.info("<Startup>: The storage is ready for serving...");
			});

			// prepare environment
			this.configSvc.prepare();
			this.info.title.top = AppData.Configuration.app.name;
			
			// build the listing of pages
			this.buildPages();

			// load statistics
			this.statisticsSvc.loadStatisticsAsync();
			
			// run initialize process
			if (AppUtility.isWebApp() && "activate" == AppUtility.parseUri(this.platform.url()).hashParams["prego"]) {
				this.activate();
			}
			else {
				this.initialize();
			}
		});
	}

	// set-up events
	setupEvents() {
		// events of page/view navigation
		AppEvents.on("OpenHomePage", () => {
			this.navigateToHomePage();
		});

		AppEvents.on("OpenPreviousPage", () => {
			this.navigateToPreviousPage();
		});

		AppEvents.on("OpenPage", (info: any) => {
			if (AppUtility.isObject(info, true) != null && AppUtility.isObject(info.args, true)) {
				this.navigate(info.args.name as string, info.args.component, info.args.params, info.args.doPush, info.args.popIfContains, info.args.noNestedStack);
			}
		});

		AppEvents.on("UpdateActiveNav", (info: any) => {
			if (AppUtility.isObject(info, true) != null && AppUtility.isObject(info.args, true)) {
				this.updateActiveNav(info.args.name as string, info.args.component, info.args.params);
			}
		});

		AppEvents.on("SetPreviousPageActive", (info: any) => {
			var previous = (AppUtility.isObject(info, true) != null && AppUtility.isObject(info.args, true))
				? info.args.current
				: undefined;
			if (this.info.nav.previous.name != previous) {
				this.updateActiveNav(this.info.nav.previous.name, this.info.nav.previous.component, this.info.nav.previous.params);
			}
		});

		// events to update avatar/title of side menu
		AppEvents.on("SessionIsRegistered", () => {
			this.updateSidebar();
			this.buildPages();
		});

		AppEvents.on("AccountIsUpdated", () => {
			this.updateSidebar();
			this.buildPages();
		});

		// events to show categories
		AppEvents.on("CategoriesAreUpdated", (info: any) => {
			this.showCategories();
		});

		AppEvents.on("CloseBook", () => {
			this.info.book.id = "";
			this.chapters = [];
		});

		// events to show chapters of a book
		AppEvents.on("OpenBook", (info: any) => {
			if (AppUtility.isObject(info, true) && AppUtility.isObject(info.args, true)) {
				this.info.book.id = info.args.ID;
				this.info.book.chapter = info.args.Chapter;
				if (this.info.book.id == info.args.ID) {
					this.showChapters();
				}
			}
		});
		AppEvents.on("BookIsUpdated", (info: any) => {
			if (AppUtility.isObject(info, true) && AppUtility.isObject(info.args, true)
			&& this.info.book.id != "" && this.info.book.id == info.args.ID
			&& info.args.TOCs && info.args.TOCs.length > 0) {
				this.displayChapters();
			}
		});
	}

	// navigation
	navigate(name: string, component: any, params?: any, doPush?: boolean, popIfContains?: string, noNestedStack?: boolean) {
		if (AppUtility.isTrue(doPush)) {
			if (this.info.nav.active.name != name || AppUtility.isFalse(noNestedStack)) {
				if (AppUtility.indexOf(popIfContains, this.info.nav.active.name) > -1) {
					this.nav.pop();
				}
				else {
					this.updatePreviousNav(this.info.nav.active.name, this.nav.getActive().component, this.nav.getActive().getNavParams().data);
				}
				this.updateActiveNav(name, component, params);
				this.nav.push(component, params);
			}
		}
		else {
			if (this.info.nav.active.name != name) {
				this.updatePreviousNav(this.info.nav.active.name, this.nav.getActive().component, this.nav.getActive().getNavParams().data);
			}
			this.updateActiveNav(name, component, params);
			this.nav.setRoot(component, params);
		}
		if (name == "HomePage") {
			AppUtility.resetUri({ home: undefined });
		}
	}

	navigateToHomePage() {
		this.updatePreviousNav(undefined, undefined);
		this.updateActiveNav("HomePage", this.info.nav.start);
		this.nav.setRoot(this.info.nav.start);
		AppUtility.resetUri({ home: undefined });
	}

	navigateToPreviousPage() {
		var name = AppUtility.isNotEmpty(this.info.nav.previous.name)
			? this.info.nav.previous.name
			: "HomePage";
		var component = AppUtility.isNotNull(this.info.nav.previous.component)
			? this.info.nav.previous.component
			: this.info.nav.start;
		var params = AppUtility.isNotNull(this.info.nav.previous.params)
			? this.info.nav.previous.params
			: undefined;

		this.updatePreviousNav(undefined, undefined);
		this.updateActiveNav(name, component, params);
		this.nav.setRoot(component, params);
	}

	updatePreviousNav(name: string, component: any, params?: any) {
		this.info.nav.previous = {
			name: name,
			component: component,
			params: params
		};
	}

	updateActiveNav(name: string, component: any, params?: any) {
		this.info.nav.active = {
			name: name,
			component: component,
			params: params
		};
	}

	// activate new account/password
	activate() {
		let uri = AppUtility.parseUri();
		let mode = uri.hashParams["mode"];
		let code = uri.hashParams["code"];
		AppUtility.resetUri({ home: undefined });

		if (AppUtility.isNotEmpty(mode) && AppUtility.isNotEmpty(code)) {
			AppUtility.trackPageView("Kích hoạt", "activate-" + mode);
			this.authSvc.activateAsync(mode, code,
				(data: any) => {
					this.initialize(() => {
						this.showActivationResults({ Status: "OK", Mode: mode });
					}, true);
				},
				(data: any) => {
					this.initialize(() => {
						this.showActivationResults({ Status: "Error", Mode: mode, Error: data.Error });
					});
				}
			);
		}
		else {
			this.initialize();
		}
	}

	showActivationResults(data: any) {
		let title = data.Status == "OK"
			? "Kích hoạt thành công"
			: "Lỗi kích hoạt";

		let message = data.Status == "OK"
			? data.Mode == "account"
				? "Tài khoản đã được kích hoạt thành công"
				: "Mật khẩu đã được kích hoạt thành công"
			: "Đã xảy ra lỗi" + (data.Error ? ": " + data.Error.Message : "");

		this.alertCtrl.create({
			title: title,
			message: message,
			enableBackdropDismiss: false,
			buttons: [{
				text: "Đóng"
			}]
		}).present();
	}

	// initialize
	initialize(onCompleted?: () => void, noInitializeSession?: boolean) {
		this.configSvc.initializeAsync(
			(d: any) => {
				// got valid sessions, then run next step
				if (this.configSvc.isReady() && this.configSvc.isAuthenticated()) {
					console.info("<Startup>: The session is initialized & registered (user)");
					this.prepare(onCompleted);
					delete this.info.attemps;
				}

				// register new session (anonymous)
				else {
					console.info("<Startup>: Register the initialized session (anonymous)", AppData.Configuration.session);
					this.configSvc.registerSessionAsync(
						() => {
							console.info("<Startup>: The session is registered (anonymous)");
							this.prepare(onCompleted);
							delete this.info.attemps;
						},
						(e: any) => {
							this.info.attemps++;
							if (AppUtility.isGotSecurityException(e.Error) && this.info.attemps < 13) {
								console.warn("<Startup>: Cannot register, the session is need to be re-initialized (anonymous)");
								AppUtility.setTimeout(async () => {
									await this.configSvc.deleteSessionAsync(() => {
										AppUtility.setTimeout(() => {
											this.initialize(onCompleted, noInitializeSession);
										}, 234);
									});
								});
							}
							else {
								console.error("<Startup>: Got an error while initializing", e);
								delete this.info.attemps;
							}
						}
					);
				}
			},
			(e: any) => {
				this.info.attemps++;
				if (AppUtility.isGotSecurityException(e.Error) && this.info.attemps < 13) {
					console.warn("<Startup>: Cannot initialize, the session is need to be re-initialized (anonymous)");
					AppUtility.setTimeout(async () => {
						await this.configSvc.deleteSessionAsync(() => {
							AppUtility.setTimeout(() => {
								this.initialize(onCompleted, noInitializeSession);
							}, 234);
						});
					});
				}
				else {
					console.error("<Startup>: Got an error while initializing", e);
					delete this.info.attemps;
				}
			},
			noInitializeSession
		);
	}

	// prepare the app
	prepare(onCompleted?: () => void) {
		// special environment of PWA (Progressive Web Apps)
		if (AppUtility.isWebApp()) {
			AppUtility.setPWAEnvironment();
		}

		// Google Analytics
		AppUtility.setGoogleAnalytics(this.ga);

		// start the real-time updater
		AppRTU.start(() => {
			// get profile
			if (this.configSvc.isAuthenticated()) {
				this.configSvc.patchAccount(
					() => {
						this.authSvc.getProfile();
					},
					345
				);
			}
			
			// load & get/merge bookmarks
			this.configSvc.loadBookmarksAsync();
			if (this.configSvc.isAuthenticated()) {
				this.configSvc.getBookmarks();
			}

			// load reading options
			this.configSvc.loadOptionsAsync();
			
			// load geo-meta
			this.resourcesSvc.loadGeoMetaAsync();

			// load statistics
			this.statisticsSvc.fetchStatistics();

			// raise an event when done
			AppEvents.broadcast("AppIsInitialized");
			console.info("<Startup>: The app is initialized", AppUtility.isDebug() ? AppData.Configuration : "");

			// hide loading
			this.loading.dismiss();
			
			// last action
			if (AppUtility.isWebApp()) {
				let uri = AppUtility.parseUri(this.platform.url());
				let params = uri.hashParams["ebook"] || uri.hashParams["read-book"];
				// navigate to the requested book
				if (params) {
					try {
						params = AppUtility.getQueryParamJson(params);
						params["Chapter"] = AppUtility.toInt(uri.hashParams["chapter"] || "0");
						params["Refs"] = "PermanentLink";
						AppUtility.isDebug() && console.info("<Startup>: Open the requested book", params);
						this.navigate("ReadBookPage", ReadBookPage, params, true);
					}
					catch (e)
					{
						AppUtility.trackPageView("Trang nhất", "home");
					}
				}
				// track page view
				else {
					AppUtility.trackPageView("Trang nhất", "home");
				}
			}

			// callback on completed
			onCompleted != undefined && onCompleted();
		});
	}

	// update side bar (avatar & title)
	updateSidebar() {
		this.info.title.top = AppData.Configuration.app.name;
		this.info.title.avatar = undefined;
		if (this.configSvc.isAuthenticated()) {
			this.info.title.top = AppUtility.isObject(AppData.Configuration.session.account.profile, true)
				? AppData.Configuration.session.account.profile.Name
				: AppData.Configuration.app.name;
			this.info.title.avatar = AppUtility.getAvatarImage(AppData.Configuration.session.account.profile);
		}
	}

	// main section (pages)
	buildPages() {
		this.pages = [
			{ name: "HomePage", component: HomePage, title: "Trang nhất", icon: "home" }
		];

		if (this.configSvc.isAuthenticated()) {
			this.pages.push({ name: "ProfilePage", component: ProfilePage, title: "Thông tin tài khoản", icon: "person", doPush: true, noNestedStack: true });
			if (this.authSvc.isAdministrator()) {
				this.pages.push({ name: "ProfileListPage", component: SearchProfilesPage, title: "Tài khoản người dùng", icon: "people" });
			}
		}
		else {
			this.pages = this.pages.concat([
				{ name: "SignInPage", component: SignInPage, title: "Đăng nhập", icon: "log-in", doPush: true, popIfContains: "ProfilePage", noNestedStack: true },
				{ name: "ProfilePage", component: ProfilePage, title: "Đăng ký tài khoản", icon: "person-add", params: { Register: true }, doPush: true, popIfContains: "SignInPage", noNestedStack: true }
			]);
		}

		this.pages.push({ name: "SearchPage", component: SearchPage, title: "Tìm kiếm", icon: "search" });
	}

	isPageActive(page: any) {
		return this.info.nav.active.name == page.name;
	}

	openPage(page: any) {
		this.navigate(page.name as string, page.component, page.params, page.doPush, page.popIfContains, page.noNestedStack);
	}

	trackPage(index: number, page: any) {
		return page.title;
	}

	// sub section: categories
	showCategories() {
		this.categories = new List(AppData.Statistics.Categories)
			.Select((category, index) => {
				return { title: category.Name, index: index, gotChildren: category.Children.length > 0 }
			})
			.ToArray();
	}

	trackCategory(index: number, category: any) {
		return category.index;
	}

	isCategoryActive(category: any) {
		return this.info.category.index == category.index && this.info.nav.active.name == "SurfBooksPage";
	}

	openCategory(category: any) {
		var title = category.title;
		this.info.category.index = category.index;
		this.navigate("SurfBooksPage", SurfBooksPage, { Category: title });
	}

	// sub section: chapters
	showChapters() {
		let book = AppData.Books.getValue(this.info.book.id);
		this.info.book.title = book.Title;
		this.displayChapters(book);
	}

	displayChapters(book?: AppModels.Book) {
		book = book != undefined ? book : AppData.Books.getValue(this.info.book.id);
		if (book.TotalChapters > 1) {
			this.chapters = new List(book.TOCs)
				.Select((toc, index) => {
					return { title: toc, index: index };
				})
				.ToArray();
		}
	}

	trackChapter(index: number, chapter: any) {
		return chapter.index;
	}

	isChapterActive(chapter: any) {
		return this.info.book.chapter == chapter.index + 1;
	}

	openChapter(chapter: any) {
		this.info.book.chapter = chapter.index + 1;
		AppEvents.broadcast("OpenChapter", { ID: this.info.book.id, Chapter: this.info.book.chapter });
	}

}