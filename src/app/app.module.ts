import { BrowserModule } from "@angular/platform-browser";
import { ErrorHandler, NgModule } from "@angular/core";
import { HttpModule } from "@angular/http";
import { FormsModule } from "@angular/forms";

import { IonicApp, IonicErrorHandler, IonicModule } from "ionic-angular";
import { CloudSettings, CloudModule } from "@ionic/cloud-angular";
import { Device } from "@ionic-native/device";
import { StatusBar } from "@ionic-native/status-bar";
import { SplashScreen } from "@ionic-native/splash-screen";
import { Keyboard } from "@ionic-native/keyboard";
import { IonicStorageModule } from "@ionic/storage";
import { FileTransfer } from "@ionic-native/file-transfer";
import { ImageCropperModule } from "ng2-img-cropper";

import { Ng2CompleterModule } from "ng2-completer";
import { RatingModule } from "ngx-rating";
import { QRCodeModule } from "angular2-qrcode";

import { App } from "./app.component";

import { ConfigurationService } from "../providers/configuration";
import { AuthenticationService } from "../providers/authentication";
import { AccountsService } from "../providers/accounts";
import { BooksService } from "../providers/books";
import { StatisticsService } from "../providers/statistics";
import { ResourcesService } from "../providers/resources";

import { HomePage } from "../pages/home/home";
import { SearchPage } from "../pages/search/search";
import { SignInPage } from "../pages/accounts/signin/signin";
import { ProfilePage } from "../pages/accounts/profile/profile";
import { SearchProfilesPage } from "../pages/accounts/search/search";
import { SurfBooksPage } from "../pages/books/surf/surf";
import { ReadBookPage } from "../pages/books/read/read";
import { BookInfoPage } from "../pages/books/info/info";
import { ReadingOptionsPage } from "../pages/books/options/options";

const cloudSettings: CloudSettings = {
	"core": {
		"app_id": ""
	}
};

@NgModule({
	declarations: [
		App,
		HomePage,
		SearchPage,
		SignInPage,
		ProfilePage,
		SearchProfilesPage,
		SurfBooksPage,
		ReadBookPage,
		BookInfoPage,
		ReadingOptionsPage,
	],
	imports: [
		BrowserModule,
		HttpModule,
		FormsModule,
		IonicModule.forRoot(App),
		IonicStorageModule.forRoot({ name: "vieappsDB" }),
		CloudModule.forRoot(cloudSettings),
		Ng2CompleterModule,
		ImageCropperModule,
		RatingModule,
		QRCodeModule,
	],
	bootstrap: [IonicApp],
	entryComponents: [
		App,
		HomePage,
		SearchPage,
		SignInPage,
		ProfilePage,
		SearchProfilesPage,
		SurfBooksPage,
		ReadBookPage,
		BookInfoPage,
		ReadingOptionsPage,
	],
	providers: [
		ConfigurationService,
		AuthenticationService,
		ResourcesService,
		StatisticsService,
		AccountsService,
		BooksService,
		StatusBar,
		SplashScreen,
		Device,
		Keyboard,
		FileTransfer,
		Ng2CompleterModule,
		ImageCropperModule,
		RatingModule,
		QRCodeModule,
		{ provide: ErrorHandler, useClass: IonicErrorHandler }
	]
})
export class AppModule { }