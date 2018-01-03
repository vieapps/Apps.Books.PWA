import { Component, ViewChild } from "@angular/core";
import { NgForm } from "@angular/forms";
import { NavController, NavParams, ViewController, AlertController, Loading, LoadingController } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";

import { AppUtility } from "../../../components/utility";
import { AppEvents } from "../../../components/events";
import { AppData } from "../../../models/data";

import { AuthenticationService } from "../../../services/authentication";

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
    public authSvc: AuthenticationService
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
			password: "",
	  },
		captcha: {
			code: "",
			uri: ""
		}
  };

	// controls
	@ViewChild("email") emailCtrl;
	@ViewChild("password") passwordCtrl;
	@ViewChild("captcha") captchaCtrl;
	loading: Loading = undefined;

  // page events
  ionViewDidLoad() {
  	this.info.state.processing = false;
  }

	ionViewDidEnter() {
		this.info.account.email = this.navParams.get("email") || "";
		this.navParams.get("mode") && this.openRenewPassword();
		AppUtility.focus(this.emailCtrl, this.keyboard);
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

	showError(data: any) {
		var message = "", ctrl = null;
		if (AppUtility.isGotWrongAccountOrPasswordException(data.Error)) {
			message = "Email hoặc mật khẩu không đúng!";
			ctrl = this.emailCtrl;
		}
		else {
			if (AppUtility.isGotCaptchaException(data.Error)) {
				message = "Mã xác thực không đúng";
			}
			else if (AppUtility.isObject(data.Error, true)) {
				message = data.Error.Message;
			}
			else {
				message = "Đã xảy ra lỗi!";
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
					this.info.account.password = "";
	      	AppUtility.focus(ctrl, this.keyboard);
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
				() => {
					this.exit();
				},
				(error: any) => {
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

}