import { Component, ViewChild } from "@angular/core";
import { NgForm } from "@angular/forms";
import { NavController, NavParams, ViewController, ActionSheetController, AlertController, Loading, LoadingController } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { CompleterService, CompleterData } from "ng2-completer";
import { List } from "linqts";

import { AppUtility } from "../../../helpers/utility";
import { AppEvents } from "../../../helpers/events";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { ConfigurationService } from "../../../providers/configuration";
import { AuthenticationService } from "../../../providers/authentication";

@Component({
	selector: "page-profile",
	templateUrl: "profile.html",
})
export class ProfilePage {
	constructor(
		public navCtrl: NavController,
		public navParams: NavParams,
		public viewCtrl: ViewController,
		public actionSheetCtrl: ActionSheetController,
		public alertCtrl: AlertController,
		public loadingCtrl: LoadingController,
		public completerSvc: CompleterService,
		public keyboard: Keyboard,
		public configSvc: ConfigurationService,
		public authSvc: AuthenticationService
	){
		this.info.state.mode = !this.authSvc.isAuthenticated() && AppUtility.isTrue(this.navParams.get("Register"))
			? "Register"
			: "Profile";
		this.initialize();
	}

	// attributes
	info = {
		title: "Thông tin tài khoản",
		state: {
			mode: "Profile",
			processing: true,
			valid: true,
			css: ""
		},
		id: "",
		profile: undefined,
		avatar: {
			current: "",
			uploaded: undefined
		},
		rating: 0.0,
		captcha: {
			code: "",
			uri: ""
		},
		address: {
			current: undefined,
			addresses: undefined
		},
		validBirthDay: {
			min: ((new Date()).getFullYear() - 120) + "-12-31",
			max: ((new Date()).getFullYear() - 16) + "-01-01"
		},
		change: {
			OldPassword: "",
			Password: "",
			ConfirmPassword: "",
			Email: "",
			ConfirmEmail: ""
		},
		invitation: {
			name: undefined,
			email: undefined,
			url: undefined
		},
		privileges: null,
		appMode: AppData.Configuration.app.mode,
		canSeeOthers: false,
		isAppleOS: AppUtility.isAppleOS()
	};
	completerData: CompleterData = undefined;

	// controls
	@ViewChild("name") nameCtrl;
	@ViewChild("email") emailCtrl;
	@ViewChild("confirmEmail") confirmEmailCtrl;
	@ViewChild("password") passwordCtrl;
	@ViewChild("confirmPassword") confirmPasswordCtrl;
	@ViewChild("gender") genderCtrl;
	@ViewChild("birthDay") birthDayCtrl;
	@ViewChild("address") addressCtrl;
	@ViewChild("addresses") addressesCtrl;
	@ViewChild("mobile") mobileCtrl;
	@ViewChild("captcha") captchaCtrl;

	@ViewChild("oldPassword") oldPasswordCtrl;
	@ViewChild("newPassword") newPasswordCtrl;
	@ViewChild("confirmNewPassword") confirmNewPasswordCtrl;
	@ViewChild("newEmail") newEmailCtrl;
	@ViewChild("confirmNewEmail") confirmNewEmailCtrl;
	@ViewChild("changeCaptcha") changeCaptchaCtrl;

	@ViewChild("guestname") guestnameCtrl;
	@ViewChild("guestemail") guestemailCtrl;

	loading: Loading = undefined;

	// page events
	ionViewDidLoad() {
		this.info.state.processing = false;
		this.info.state.css = "text-input "
			+ (AppUtility.isAppleOS()
				? "text-input-ios"
				: AppUtility.isWindowsPhoneOS()
					? "text-input-wp"
					: "text-input-md");
	}

	ionViewCanEnter() {
		return this.isAdministrator() || this.info.id == "";
	}

	ionViewDidEnter() {
		if (this.info.state.mode == "Register") {
			this.setBackButton(false);
			this.renewCaptcha(() => {
				AppUtility.focus(this.nameCtrl, this.keyboard);
			});
		}
	}

	ionViewDidLeave() {
		AppEvents.broadcast("SetPreviousPageActive", { current: "ProfilePage" });
	}

	// run initialize
	initialize() {
		if (this.info.state.mode == "Register") {
			this.info.title = "Đăng ký tài khoản";
			this.info.profile = {
				Name: "",
				Email: "",
				ConfirmEmail: "",
				Password: "",
				ConfirmPassword: "",
				Gender: "",
				BirthDay: "",
				Address: "",
				County: "",
				Province: "",
				Country: "",
				Mobile: ""
			};
		}
		else {
			this.info.id = this.navParams.get("ID");
			this.info.id = AppUtility.isNotEmpty(this.info.id) ? this.info.id : "";
			this.info.canSeeOthers = this.info.id == "" || this.info.id == AppData.Configuration.session.account.id || this.isAdministrator();

			this.info.profile = this.info.id == "" || this.info.id == AppData.Configuration.session.account.id
				? AppModels.Account.deserialize(this.configSvc.getAccount().profile)
				: AppData.Accounts.getValue(this.info.id);
				
			this.info.avatar.current = AppUtility.getAvatarImage(this.info.profile);
			this.info.title = this.info.id != "" && this.info.id != AppData.Configuration.session.account.id
				? this.info.profile.Name
				: "Thông tin tài khoản";

			var rating = (this.info.profile as AppModels.Account).RatingPoints.getValue("General");
			this.info.rating = rating != undefined ? rating.Average : 0;
		}

		this.info.address = AppUtility.initializeAddress(this.info.profile);
		this.completerData = this.completerSvc.local(this.info.address.addresses, "title,titleANSI", "title");
	}

	// event handlers
	showActions() {
		var actionSheet = this.actionSheetCtrl.create({
			enableBackdropDismiss: true
		});

		if (this.info.profile.ID == AppData.Configuration.session.account.id) {
			actionSheet.addButton({
				text: "Cập nhật",
				icon: this.info.isAppleOS ? undefined : "create",
				handler: () => {
					this.openUpdate();
				}
			});
			actionSheet.addButton({
				text: "Đổi mật khẩu",
				icon: this.info.isAppleOS ? undefined : "key",
				handler: () => {
					this.openChangePassword();
				}
			});
			actionSheet.addButton({
				text: "Đổi email đăng nhập",
				icon: this.info.isAppleOS ? undefined : "mail",
				handler: () => {
					this.openChangeEmail();
				}
			});
		}
		else if (this.isAdministrator() && this.info.id != "" && this.info.id != AppData.Configuration.session.account.id) {
			actionSheet.addButton({
				text: "Đặt quyền truy cập",
				icon: this.info.isAppleOS ? undefined : "settings",
				handler: () => {
					this.openPrivileges();
				}
			});
		}

		if (this.info.id == "") {
			actionSheet.addButton({
				text: "Đăng xuất",
				icon: this.info.isAppleOS ? undefined : "log-out",
				handler: () => {
					this.doSignOut();
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

	openInvitation() {
		this.setBackButton(false);
		this.info.state.mode = "Invite";
		this.info.title = "Mời bạn bè";
		this.info.invitation.url = AppUtility.getUri() + "#?refer=" + AppUtility.getBase64UrlParam({ uid: this.info.profile.ID, section: "WPA" }) + "&utm_campaign=WPA-Direct-Invitation&utm_medium=Direct-Invitation-Link";
		AppUtility.focus(this.guestnameCtrl, this.keyboard);
	}

	openUpdate() {
		this.setBackButton(false);
		this.info.state.mode = "Update";
		this.info.title = "Cập nhật tài khoản";
		AppUtility.focus(this.nameCtrl, this.keyboard);
	}

	openChangePassword() {
		this.setBackButton(false);
		this.info.state.mode = "ChangePassword";
		this.info.title = "Đổi mật khẩu";
		AppUtility.focus(this.oldPasswordCtrl, this.keyboard);
	}

	openChangeEmail() {
		this.setBackButton(false);
		this.renewCaptcha();
		this.info.state.mode = "ChangeEmail";
		this.info.title = "Đổi email";
		AppUtility.focus(this.oldPasswordCtrl, this.keyboard);
	}

	openPrivileges() {
		this.setBackButton(false);
		this.info.state.mode = "SetPrivileges";
		this.info.title = "Đặt quyền truy cập";
		this.info.privileges = {
			roles: [
				{ label: "Người quản trị", value: "Administrator" },
				{ label: "Người kiểm duyệt", value: "Moderator" },
				{ label: "Người dùng", value: "User" }
			],
			sections: [
				{ label: "Sách điện tử", serviceName: "Books", objectName: "Book" },
				{ label: "Thông tin thống kê", serviceName: "Books", objectName: "Statistic" },
				{ label: "Tài khoản người dùng", serviceName: "Users", objectName: "Profile" }
			],
			permissions: {
				role: this.authSvc.getRole(this.info.profile),
				sections: {}
			}
		};
		new List<any>(this.info.privileges.sections).ForEach((s) => {
			let isAdministrator = this.authSvc.isAuthorized(s.serviceName, s.objectName, "Full");
			let isModerator = !isAdministrator && (this.authSvc.isAuthorized(s.serviceName, s.objectName, "Write") || this.authSvc.isAuthorized(s.serviceName, s.objectName, "Lock"));
			this.info.privileges.permissions.sections[s.value] = isAdministrator
				? "Administrator"
				: isModerator
					? "Moderator"
					: "User";
		});
	}

	// helpers
	renewCaptcha(onCompleted?: () => void) {
		this.authSvc.registerCaptchaAsync(
			() => {
				this.info.captcha = {
					code: "",
					uri: AppData.Configuration.session.captcha.uri
				};
				if (onCompleted != undefined) {
					onCompleted();
				}
			}
		);
	}

	selectAddress(item: any) {
		if (AppUtility.isObject(item, null) && AppUtility.isObject(item.originalObject, null)) {
			this.info.address.current = item.originalObject;
		}
	}

	setBackButton(state: boolean) {
		this.viewCtrl.showBackButton(state);
	}

	cancel() {
		if (this.info.state.mode == "Register") {
			this.exit();
		}
		else {
			this.cancelUpdate();
		}
	}

	cancelUpdate() {
		this.hideLoading();
		this.info.state.processing = false;
		this.setBackButton(true);
		this.info.state.mode = "Profile";
		this.info.title = "Thông tin tài khoản";
	}

	exit() {
		this.navCtrl.pop();
	}

	openGoogleMaps() {
		AppUtility.openGoogleMaps(this.info.profile.FullAddress);
	}

	isAdministrator() {
		return this.authSvc.isAdministrator();
	}

	isNotNull(value: string) {
		return AppUtility.isNotNull(value);
	}

	isNotEmpty(value: string) {
		return AppUtility.isNotEmpty(value);
	}

	isValidEmail(email: string) {
		return AppUtility.isValidEmail(email);
	}

	isValidInfo(form: NgForm) {
		if (!form.valid) {
			if (!form.controls.name.valid) {
				AppUtility.focus(this.nameCtrl, this.keyboard);
			}
			else if (form.controls.email && !form.controls.email.valid) {
				AppUtility.focus(this.emailCtrl, this.keyboard);
			}
			else if (form.controls.confirmEmail && !form.controls.confirmEmail.valid) {
				AppUtility.focus(this.confirmEmailCtrl, this.keyboard);
			}
			else if (form.controls.password && !form.controls.password.valid) {
				AppUtility.focus(this.passwordCtrl, this.keyboard);
			}
			else if (form.controls.confirmPassword && !form.controls.confirmPassword.valid) {
				AppUtility.focus(this.confirmPasswordCtrl, this.keyboard);
			}
			else if (this.genderCtrl && !form.controls.gender.valid) {
				AppUtility.focus(this.genderCtrl, this.keyboard);
			}
			else if (this.birthDayCtrl && !form.controls.birthYear.valid) {
				AppUtility.focus(this.birthDayCtrl, this.keyboard);
			}
			else if (this.addressCtrl && !form.controls.address.valid) {
				AppUtility.focus(this.addressCtrl, this.keyboard);
			}
			else if (this.addressesCtrl && !this.info.address.current) {
				AppUtility.focus(this.addressesCtrl.inputId, this.keyboard);
			}
			else if (this.mobileCtrl && !form.controls.mobile.valid) {
				AppUtility.focus(this.mobileCtrl, this.keyboard);
			}
			else if (!form.controls.captcha.valid) {
				AppUtility.focus(this.captchaCtrl, this.keyboard);
			}
			return false;
		}
		else {
			if (this.emailCtrl && !this.isValidEmail(this.info.profile.Email)) {
				AppUtility.focus(this.emailCtrl, this.keyboard);
				return false;
			}
			else if (this.confirmEmailCtrl && (!this.isValidEmail(this.info.profile.ConfirmEmail) || this.info.profile.ConfirmEmail != this.info.profile.Email)) {
				AppUtility.focus(this.confirmEmailCtrl, this.keyboard);
				return false;
			}
			else if (!this.info.profile.Gender) {
				AppUtility.focus(this.genderCtrl, this.keyboard);
				return false;
			}
			else if (!this.info.profile.BirthDay) {
				AppUtility.focus(this.birthDayCtrl, this.keyboard);
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

	showError(data: any, setFocus?: () => void) {
		this.hideLoading();
		this.info.state.processing = false;
		var message = "", ctrl = null;
		if (AppUtility.isGotWrongAccountOrPasswordException(data.Error)) {
			message = "Mật khẩu hiện tại không đúng!";
			ctrl = this.oldPasswordCtrl;
		}
		else if (AppUtility.isGotCaptchaException(data.Error)) {
			message = "Mã xác thực không đúng";
			ctrl = this.info.state.mode == "Register" ? this.captchaCtrl : this.changeCaptchaCtrl;
		}
		else {
			message = AppUtility.isObject(data.Error) && AppUtility.isNotEmpty(data.Error.Message)
				? data.Error.Message
				: "Đã xảy ra lỗi!"
		}

		if (this.info.state.mode != "Update" && this.info.state.mode != "SetPrivileges") {
			this.renewCaptcha();
		}

		this.showAlert(
			"Lỗi!",
			message,
			setFocus != undefined
				? setFocus
				: () => {
					AppUtility.focus(ctrl, this.keyboard);
				}
		);
	}

	showAlert(title: string, message: string, handler?: () => void) {
		this.hideLoading();
		this.alertCtrl.create({
			title: title,
			message: message,
			enableBackdropDismiss: false,
			buttons: [{
				text: "Đóng",
				handler: handler
			}]
		}).present();
	}

	// register
	doRegister(form: NgForm) {
		this.info.state.valid = this.isValidInfo(form);
		if (this.info.state.valid) {
			this.info.state.processing = true;
			this.authSvc.registerAccountAsync(this.info.profile, this.info.captcha.code,
				() => {
					this.showAlert(
						"Đăng ký",
						"Vui lòng kiểm tra email và làm theo hướng dẫn để kích hoạt tài khoản",
						() => {
							this.exit();
						}
					);
				},
				(error: any) => {
					this.showError(error);
				}
			);
		}
	}

	// send an invitation
	sendInvitation() {
		var setFocus = () => {
			AppUtility.focus(
				!AppUtility.isNotEmpty(this.info.invitation.name)
					? this.guestnameCtrl
					: this.guestemailCtrl,
				this.keyboard
			);
		};

		if (AppUtility.isNotEmpty(this.info.invitation.name) && AppUtility.isValidEmail(this.info.invitation.email)) {
			this.showLoading("Gửi lời mời...");
			this.info.state.processing = true;
			this.authSvc.sendInvitationAsync(this.info.invitation.name, this.info.invitation.email,
				() => {
					this.showAlert(
						"Mời bạn",
						"Email lời mời đã được gửi thành công!",
						() => {
							this.cancelUpdate();
						}
					);
				},
				(error: any) => {
					this.showError(error, setFocus);
				}
			);
		}
		else {
			setFocus();
		}
	}

	// update
	doUpdate(form: NgForm) {
		this.info.state.valid = this.isValidInfo(form);
		if (this.info.state.valid) {
			this.showLoading("Cập nhật hồ sơ...");
			this.info.state.processing = true;
			this.info.profile.County = this.info.address.current.county;
			this.info.profile.Province = this.info.address.current.province;
			this.info.profile.Country = this.info.address.current.country;
			this.authSvc.saveProfileAsync(this.info.profile,
				() => {
					this.info.profile = AppUtility.clone(this.configSvc.getAccount().profile);
					this.info.avatar.current = AppUtility.getAvatarImage(this.info.profile);
					this.cancelUpdate();
				},
				(error: any) => {
					this.showError(error);
				}
			);
		}
	}

	doChangePassword() {
		var setFocus = () => {
			AppUtility.focus(!AppUtility.isNotEmpty(this.info.change.OldPassword)
				? this.oldPasswordCtrl
				: !AppUtility.isNotEmpty(this.info.change.Password)
					? this.newPasswordCtrl
					: this.confirmNewPasswordCtrl,
				this.keyboard);
		};

		this.info.state.valid = AppUtility.isNotEmpty(this.info.change.OldPassword)
			&& AppUtility.isNotEmpty(this.info.change.Password) && AppUtility.isNotEmpty(this.info.change.ConfirmPassword)
			&& this.info.change.ConfirmPassword == this.info.change.Password;

		if (this.info.state.valid) {
			this.showLoading("Đổi mật khẩu đăng nhập...");
			this.info.state.processing = true;
			this.authSvc.updatePasswordAsync(this.info.change.OldPassword, this.info.change.Password,
				() => {
					this.showAlert(
						"Đổi mật khẩu",
						"Mật khẩu đăng nhập mới đã được cập nhật thành công!",
						() => {
							this.info.change.OldPassword = undefined;
							this.info.change.Password = undefined;
							this.info.change.ConfirmPassword = undefined;
							this.cancelUpdate();
						}
					);
				},
				(error: any) => {
					this.showError(error, setFocus);
				}
			);
		}
		else {
			setFocus();
		}
	}

	doChangeEmail() {
		var setFocus = () => {
			AppUtility.focus(!AppUtility.isNotEmpty(this.info.change.OldPassword)
				? this.oldPasswordCtrl
				: !AppUtility.isNotEmpty(this.info.change.Email)
					? this.newEmailCtrl
					: this.confirmNewEmailCtrl,
				this.keyboard);
		};

		this.info.state.valid = AppUtility.isNotEmpty(this.info.change.OldPassword)
			&& AppUtility.isNotEmpty(this.info.change.Email) && AppUtility.isNotEmpty(this.info.change.ConfirmEmail)
			&& this.info.change.ConfirmEmail == this.info.change.Email;

		if (this.info.state.valid) {
			this.showLoading("Đổi email đăng nhập...");
			this.info.state.processing = true;
			this.authSvc.updateEmailAsync(this.info.change.OldPassword, this.info.change.Email,
				() => {
					this.showAlert(
						"Đổi email",
						"Email đăng nhập mới đã được cập nhật thành công!",
						() => {
							this.info.change.OldPassword = undefined;
							this.info.change.Email = undefined;
							this.info.change.ConfirmEmail = undefined;
							this.cancelUpdate();
						}
					);
				},
				(error: any) => {
					this.showError(error, setFocus);
				}
			);
		}
		else {
			setFocus();
		}
	}

	doSetPrivileges() {
		var body = {
			ID: this.info.profile.ID,
			Role: this.info.privileges.permissions.role,
			Sections: {}
		};
		for (let s in this.info.privileges.permissions.sections) {
			body.Sections[s] = this.info.privileges.permissions.sections[s];
		}

		this.showLoading("Đặt quyền truy cập...");
		this.info.state.processing = true;
		this.authSvc.setPrivilegesAsync(body,
			() => {
				this.info.profile = AppData.Accounts.getValue(this.info.id);
				this.info.avatar.current = AppUtility.getAvatarImage(this.info.profile);
				this.cancelUpdate();
			},
			(error: any) => {
				this.showError(error);
			}
		);
	}

	// sign-out
	doSignOut() {
		this.alertCtrl.create({
			title: "Đăng xuất",
			message: "Đăng xuất khỏi hệ thống?",
			enableBackdropDismiss: false,
			buttons: [
				{
					text: "Huỷ bỏ",
				},
				{
					text: "Đăng xuất",
					handler: () => {
						this.authSvc.signOutAsync(() => {
							this.exit();
						});
					}
				}
			]
		}).present();
	}

}