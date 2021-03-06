import { Component, ViewChild } from "@angular/core";
import { NgForm } from "@angular/forms";
import { NavController, NavParams, ViewController, AlertController, Loading, LoadingController } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";

import { AppUtility } from "../../../components/utility";
import { AppEvents } from "../../../components/events";
import { AppData } from "../../../models/data";

import { AuthenticationService } from "../../../services/authentication";
import { BooksService } from "../../../services/books";

@Component({
  selector: "page-signin",
  templateUrl: "signin.html",
})
export class SignInPage {
  constructor(
  	public navCtrl: NavController,
  	public navParams: NavParams,
  	public viewCtrl: ViewController,
  	public alertCtrl: AlertController,
		public loadingCtrl: LoadingController,
  	public keyboard: Keyboard,
    public authSvc: AuthenticationService,
    public booksSvc: BooksService
  ){
  }

  // attributes
  info = {
  	state: {
  		processing: true,
	  	mode: "SignIn",
	  	title: "Đăng nhập",
			valid: true
  	},
	  account: {
			email: "",
			password: ""
	  },
		captcha: {
			code: "",
			uri: ""
		},
		otp: {
			id: "",
			value: "",
			providers: []
		}
  };

	// controls
	@ViewChild("email") emailCtrl;
	@ViewChild("password") passwordCtrl;
	@ViewChild("captcha") captchaCtrl;
	@ViewChild("otp") otpCtrl;
	loading: Loading = undefined;

  // page events
  ionViewDidLoad() {
  	this.info.state.processing = false;
  }

	ionViewDidEnter() {
		this.info.account.email = this.navParams.get("email") || "";
		this.navParams.get("mode") && this.openRenewPassword();
		AppUtility.focus(this.emailCtrl, this.keyboard);
		AppUtility.resetUri({ signin: undefined });
		AppUtility.trackPageView(this.info.state.title, "sign-in");
	}

  ionViewWillUnload() {
		AppEvents.broadcast("SetPreviousPageActive", { current: "SignInPage" });
  }

  // helpers
  renewCaptcha(dontFocus?: boolean) {
  	this.authSvc.registerCaptchaAsync(
  		() => {
	  		this.info.captcha = {
	  			code: "",
	  			uri: AppData.Configuration.session.captcha.uri
	  		};
	  		if (AppUtility.isFalse(dontFocus)) {
		  		AppUtility.focus(
		  			!AppUtility.isValidEmail(this.info.account.email)
			  			? this.emailCtrl
			  			: this.info.state.mode == "SignIn" && !AppUtility.isNotEmpty(this.info.account.password)
			  				? this.passwordCtrl
			  				: this.captchaCtrl,
		  			this.keyboard);
	  		}
	  	}
	  );
  }

	isValidEmail(email: string) {
		return AppUtility.isValidEmail(email);
	}

  isNotEmpty(value: string) {
  	return AppUtility.isNotEmpty(value);
  }

	isValidInfo(form: NgForm) {
		if (!form.valid) {
			if (!form.controls.email.valid) {
				AppUtility.focus(this.emailCtrl, this.keyboard);
			}
			else if (form.controls.password && !form.controls.password.valid) {
				AppUtility.focus(this.passwordCtrl, this.keyboard);
			}
			else if (this.info.state.mode != "SignIn") {
				AppUtility.focus(this.captchaCtrl, this.keyboard);
			}
			return false;
		}
		else {
			if (!AppUtility.isValidEmail(this.info.account.email)) {
				AppUtility.focus(this.emailCtrl, this.keyboard);
				return false;
			}
			else if (this.info.state.mode == "Password" && !AppUtility.isNotEmpty(this.info.captcha.code)) {
				AppUtility.focus(this.captchaCtrl, this.keyboard);
				return false;
			}
			else {
				return form.valid;
			}
		}
	}

	showLoading(msg: string) {
		this.loading = this.loadingCtrl.create({ content: msg });
		this.loading.present();
	}

	hideLoading() {
		if (this.loading != undefined) {
			this.loading.dismiss();
			this.loading = undefined;
		}
	}

	exit() {
		this.hideLoading();
		this.navCtrl.pop();
	}

	showError(data: any, handler?: () => void) {
		var message = "", ctrl = null;
		if (AppUtility.isGotWrongAccountOrPasswordException(data)) {
			message = "Email hoặc mật khẩu không đúng!";
			ctrl = this.emailCtrl;
		}
		else {
			if (AppUtility.isGotCaptchaException(data)) {
				message = "Mã xác thực không đúng";
			}
			else {
				message = data.Message ? data.Message : "Đã xảy ra lỗi!";
			}
			ctrl = this.info.state.mode == "SignIn" ? this.passwordCtrl : this.captchaCtrl;
		}

		this.hideLoading();
		if (this.info.state.mode != "SignIn") {
			this.renewCaptcha(true);
		}
		
		this.alertCtrl.create({
	    title: "Lỗi",
	    message: message,
	    enableBackdropDismiss: false,
	    buttons: [{
	      text: "Đóng",
	      handler: () => {
					this.info.state.processing = false;
					if (handler != undefined) {
						handler();
					}
					else {
						this.info.account.password = "";
						AppUtility.focus(ctrl, this.keyboard);
					}
	      }
	    }]
	  }).present();
	}

	// sign in
	doSignIn(form: NgForm) {
		this.info.state.valid = this.isValidInfo(form);
		if (this.info.state.valid) {
			this.showLoading("Đăng nhập...");
			this.info.state.processing = true;
			this.authSvc.signInAsync(this.info.account.email, this.info.account.password, 
				data => {
					this.hideLoading();
					this.info.state.processing = false;
					if (data.Require2FA) {
						this.openOTP(data);
					}
					else {
						this.booksSvc.getBookmarks();
						this.exit();
					}
				},
				error => {
					this.showError(error);
				}
			);
		}
	}

	// renew password
  openRenewPassword() {
  	this.renewCaptcha();
  	this.info.state.mode = "Password";
  	this.info.state.title = "Lấy mật khẩu mới";
  }

	doRenewPassword(form: NgForm) {
		this.info.state.valid = this.isValidInfo(form);
		if (this.info.state.valid) {
			this.showLoading("Lấy mật khẩu...");
			this.info.state.processing = true;
			this.authSvc.resetPasswordAsync(this.info.account.email, this.info.captcha.code,
				() => {
					this.alertCtrl.create({
			      title: "Mật khẩu mới",
			      message: "Vui lòng kiểm tra email và làm theo hướng dẫn để lấy mật khẩu mới!",
			      enableBackdropDismiss: false,
			      buttons: [{
			        text: "Đóng",
			        handler: () => {
			        	this.exit();
			        }
			      }]
			    }).present();
				},
				(error: any) => {
					this.showError(error);
				}
			);
		}
	}

	// OTP
	openOTP(data: any) {
		this.info.account.password = "";		
		this.info.otp.id = data.ID;
		this.info.otp.providers = data.Providers;
  	this.info.state.mode = "OTP";
		this.info.state.title = "Xác thực lần hai";
		AppUtility.focus(this.otpCtrl, this.keyboard, 345);
	}

	doValidateOTP(form: NgForm) {
		this.info.state.valid = AppUtility.isNotEmpty(this.info.otp.value);
		if (this.info.state.valid) {
			this.showLoading("Xác thực...");
			this.info.state.processing = true;
			this.authSvc.validateOTPAsync(this.info.otp.id, this.info.otp.value, this.info.otp.providers[0].Info, 
				(data: any) => {
					AppUtility.trackPageView("Xác thực với OTP", "validate-otp");
					this.booksSvc.getBookmarks();
					this.exit();
				},
				(error: any) => {
					this.showError(error, () => {
						this.info.otp.value = "";
						AppUtility.focus(this.otpCtrl, this.keyboard, 345);
					});
				}
			);
		}
		else {
			AppUtility.focus(this.otpCtrl, this.keyboard, 234);
		}
	}

}