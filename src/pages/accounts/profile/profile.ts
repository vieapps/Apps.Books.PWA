import { Component, ViewChild } from "@angular/core";
import { Http } from "@angular/http";
import { NgForm } from "@angular/forms";
import { NavController, NavParams, ViewController, ActionSheetController, AlertController, Loading, LoadingController, TextInput, Content } from "ionic-angular";
import { Keyboard } from "@ionic-native/keyboard";
import { CompleterService, CompleterData, CompleterCmp } from "ng2-completer";
import { ImageCropperComponent, CropperSettings } from "ng2-img-cropper";
import { List } from "linqts";

import { AppUtility } from "../../../components/utility";
import { AppEvents } from "../../../components/events";
import { AppAPI } from "../../../components/api";
import { AppData } from "../../../models/data";
import { AppModels } from "../../../models/objects";

import { ConfigurationService } from "../../../services/configuration";
import { AuthenticationService } from "../../../services/authentication";

import { SignInPage } from "../signin/signin";
import { HomePage } from "../../home/home";
import { ReadBookPage } from "../../books/read/read";

@Component({
	selector: "page-profile",
	templateUrl: "profile.html",
})
export class ProfilePage {
	constructor(
		public http: Http,
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
		// initialize
		this.info.state.mode = !this.configSvc.isAuthenticated() && AppUtility.isTrue(this.navParams.get("Register"))
			? "Register"
			: "Profile";
		this.initialize();

		// image cropper
		this.cropper.settings.width = 100;
		this.cropper.settings.height = 100;
		this.cropper.settings.croppedWidth = 300;
		this.cropper.settings.croppedHeight = 300;
		this.cropper.settings.canvasWidth = 272;
		this.cropper.settings.canvasHeight = 272;
		this.cropper.settings.noFileInput = true;
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
			mode: "Avatar",
			current: "",
			uploaded: ""
		},
		rating: 0.0,
		bookmarks: [],
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
		otp: {
			required: false,
			providers: new Array<{Label: string, Type: string, Time: Date, Info: string}>(),
			provisioning: "",
			url: "",
			value: ""
		},
		invitation: {
			name: undefined,
			email: undefined,
			url: undefined
		},
		canSeeOthers: false,
		isAppleOS: AppUtility.isAppleOS()
	};
	permissions = {
		info: {
			roles: [
				{ label: "Người quản trị", value: "Administrator" },
				{ label: "Người kiểm duyệt", value: "Moderator" },
				{ label: "Người dùng", value: "Viewer" }
			],
			objects: [
				{ label: "Sách điện tử", value: "book" },
				{ label: "Thể loại", value: "category" },
				{ label: "Thông tin thống kê", value: "statistic" }
			]
		},
		current: {
			role: "",
			privileges: new Array<AppModels.Privilege>()
		},
		update: {
			role: "",
			privileges: {}
		}
	};
	completerData: CompleterData = undefined;
	cropper = {
		settings: new CropperSettings(),
		data: {
			image: "",
			original: undefined
		}
	};

	// controls
	loading: Loading = undefined;
	
	@ViewChild("name") nameCtrl: TextInput;
	@ViewChild("email") emailCtrl: TextInput;
	@ViewChild("confirmEmail") confirmEmailCtrl: TextInput;
	@ViewChild("password") passwordCtrl: TextInput;
	@ViewChild("confirmPassword") confirmPasswordCtrl: TextInput;
	@ViewChild("gender") genderCtrl: TextInput;
	@ViewChild("birthDay") birthDayCtrl: TextInput;
	@ViewChild("address") addressCtrl: TextInput;
	@ViewChild("addresses") addressesCtrl: CompleterCmp;
	@ViewChild("mobile") mobileCtrl: TextInput;
	@ViewChild("captcha") captchaCtrl: TextInput;

	@ViewChild("oldPassword") oldPasswordCtrl: TextInput;
	@ViewChild("newPassword") newPasswordCtrl: TextInput;
	@ViewChild("confirmNewPassword") confirmNewPasswordCtrl: TextInput;
	@ViewChild("newEmail") newEmailCtrl: TextInput;
	@ViewChild("confirmNewEmail") confirmNewEmailCtrl: TextInput;
	@ViewChild("changeCaptcha") changeCaptchaCtrl: TextInput;

	@ViewChild("guestname") guestnameCtrl: TextInput;
	@ViewChild("guestemail") guestemailCtrl: TextInput;

	@ViewChild("avatarcropper") cropperCtrl: ImageCropperComponent;

	@ViewChild("otp") otpCtrl;

	@ViewChild(Content) contentCtrl: Content;
	
	// page events
	ionViewDidLoad() {
		this.info.state.processing = false;
		this.info.state.css = AppUtility.getTextInputCss();

		AppEvents.on(
			"AccountIsUpdated",
			(info: any) => {
				this.initialize();
			},
			"UpdateAccountInfoEventHandler"
		);
			
		AppEvents.on(
			"BookmarksAreUpdated",
			(info: any) => {
				this.buildBookmakrs();
			},
			"UpdateBookmarksEventHandler"
		);
	}

	ionViewCanEnter() {
		return this.authSvc.isAdministrator() || this.info.id == "";
	}

	ionViewDidEnter() {
		if (this.info.state.mode == "Register") {
			this.setBackButton(false);
			this.renewCaptcha(() => {
				AppUtility.focus(this.nameCtrl, this.keyboard);
			});
			AppUtility.resetUri({ register: undefined });
			AppUtility.trackPageView(this.info.title, "register-account");
		}
		else {
			if (this.info.id == "") {
				AppUtility.resetUri({ myprofile: undefined });
				AppUtility.trackPageView(this.info.title, "my-account");
			}
			else {
				AppUtility.resetUri({ profile: AppUtility.getBase64UrlParam({ ID: this.info.id }) });
				AppUtility.trackPageView(this.info.title, "user-account/" + this.info.id);
			}
		}
		
	}

	ionViewWillUnload() {
		AppEvents.off("AccountIsUpdated", "UpdateAccountInfoEventHandler");
		AppEvents.off("BookmarksAreUpdated", "UpdateBookmarksEventHandler");
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
				Gender: "NotProvided",
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
			this.info.canSeeOthers = this.info.id == "" || this.info.id == AppData.Configuration.session.account.id || this.authSvc.isAdministrator();

			this.info.profile = this.info.id == "" || this.info.id == AppData.Configuration.session.account.id
				? AppModels.Account.deserialize(this.configSvc.getAccount().profile)
				: AppData.Accounts.getValue(this.info.id);
				
			this.info.avatar.current = AppUtility.getAvatarImage(this.info.profile);
			this.info.avatar.mode = this.info.avatar.current == this.info.profile.Gravatar
				? "Gravatar"
				: "Avatar";
			this.info.title = this.info.id != "" && this.info.id != AppData.Configuration.session.account.id
				? this.info.profile.Name
				: "Thông tin tài khoản";

			var rating = (this.info.profile as AppModels.Account).RatingPoints.getValue("General");
			this.info.rating = rating != undefined ? rating.Average : 0;

			if (this.info.profile.ID == AppData.Configuration.session.account.id) {
				this.buildBookmakrs();
			}
			else if (this.authSvc.isAdministrator()) {
				this.authSvc.getPrivilegesAsync(this.info.profile.ID, (data: any) => {
					this.preparePrivileges(data);
				});
			}
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
			actionSheet.addButton({
				text: "Thiết đặt bảo mật",
				icon: this.info.isAppleOS ? undefined : "unlock",
				handler: () => {
					this.openUpdateOTP();					
				}
			});
		}
		else if (this.authSvc.isAdministrator() && this.info.id != "" && this.info.id != AppData.Configuration.session.account.id) {
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
		this.cropper.data.image = this.info.avatar.current;
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
		this.info.state.mode = "ChangeEmail";
		this.info.title = "Đổi email";
		AppUtility.focus(this.oldPasswordCtrl, this.keyboard);
	}

	openUpdateOTP() {
		this.setBackButton(false);
		this.info.state.mode = "UpdateOTP";
		this.info.title = "Thiết đặt bảo mật";
		this.info.otp.required = AppData.Configuration.session.account.twoFactors.required;
		this.info.otp.providers = AppData.Configuration.session.account.twoFactors.providers;
		this.info.otp.provisioning = "";
		this.info.otp.url = "";
		this.info.otp.value = "";
	}

	getRole(objectName?: string) {
		return this.authSvc.isInAppRole(objectName || "", "Administrator", this.permissions.current.privileges)
			? "Administrator"
			: this.authSvc.isInAppRole(objectName || "", "Moderator", this.permissions.current.privileges)
				? "Moderator"
				: "Viewer"
	}

	preparePrivileges(data: any) {
		if (data.Status == "OK") {
			this.permissions.current.privileges = this.configSvc.prepareAccount(data.Data).Privileges;
			this.permissions.current.role = this.getRole();
		}
	}

	openPrivileges() {
		this.setBackButton(false);
		this.info.state.mode = "SetPrivileges";
		this.info.title = "Đặt quyền truy cập";

		this.permissions.update.role = this.permissions.current.role;
		new List<any>(this.permissions.info.objects)
			.ForEach(o => {
				let privilege = new List<AppModels.Privilege>(this.permissions.current.privileges).FirstOrDefault(p => p.ServiceName == "books" && p.ObjectName == o.value);
				this.permissions.update.privileges[o.value] = privilege
					? privilege.Role
					: this.getRole(o.value);
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
		this.contentCtrl.scrollToTop().then(() => {
			this.info.state.processing = false;
			this.setBackButton(true);
			this.info.state.mode = "Profile";
			this.info.title = "Thông tin tài khoản";
		});
	}

	exit() {
		this.navCtrl.pop();
	}

	openGoogleMaps() {
		AppUtility.openGoogleMaps(this.info.profile.FullAddress);
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
			else if (form.controls.confirmEmail && (!form.controls.confirmEmail.valid || !this.isValidEmail(this.info.profile.ConfirmEmail) || this.info.profile.ConfirmEmail != this.info.profile.Email)) {
				AppUtility.focus(this.confirmEmailCtrl, this.keyboard);
			}
			else if (form.controls.password && !form.controls.password.valid) {
				AppUtility.focus(this.passwordCtrl, this.keyboard);
			}
			else if (form.controls.confirmPassword && (!form.controls.confirmPassword.valid || this.info.profile.ConfirmPassword != this.info.profile.Password)) {
				AppUtility.focus(this.confirmPasswordCtrl, this.keyboard);
			}
			else if (this.genderCtrl && !form.controls.gender.valid) {
				AppUtility.focus(this.genderCtrl, this.keyboard);
			}
			else if (this.birthDayCtrl && !form.controls.birthDay.valid) {
				AppUtility.focus(this.birthDayCtrl, this.keyboard);
			}
			else if (this.addressCtrl && !form.controls.address.valid) {
				AppUtility.focus(this.addressCtrl, this.keyboard);
			}
			else if (this.addressesCtrl && !this.info.address.current) {
				AppUtility.focus(this.addressesCtrl.ctrInput, this.keyboard);
			}
			else if (this.mobileCtrl && !form.controls.mobile.valid) {
				AppUtility.focus(this.mobileCtrl, this.keyboard);
			}
			else if (this.captchaCtrl && !form.controls.captcha.valid) {
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
			else if (this.confirmPasswordCtrl && this.info.profile.ConfirmPassword != this.info.profile.Password) {
				AppUtility.focus(this.confirmPasswordCtrl, this.keyboard);
				return false;
			}
			else if (this.genderCtrl && !this.info.profile.Gender) {
				AppUtility.focus(this.genderCtrl, this.keyboard);
				return false;
			}
			else if (this.birthDayCtrl && !this.info.profile.BirthDay) {
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
					if (AppUtility.isObject(error.Error, true) && "InformationExistedException" == error.Error.Type) {
						this.renewCaptcha();
						this.hideLoading();
						this.info.state.processing = false;
						this.alertCtrl.create({
							title: "Chú ý",
							message: "Địa chỉ email (" + this.info.profile.Email + ") đã được sử dụng để đăng ký tài khoản.\nCó muốn lấy mật khẩu mới cho địa chỉ email này?",
							enableBackdropDismiss: false,
							buttons: [{
								text: "Không",
								role: "cancel"
							},
							{
								text: "Lấy mật khẩu mới",
								handler: () => {
									AppEvents.broadcast("OpenPage", {
										name: "SignInPage",
										component: SignInPage,
										params: {
											mode: "Password",
											email: this.info.profile.Email
										},
										doPush: true,
										popIfContains: "ProfilePage,SignInPage",
										noNestedStack: true
									});
								}
							}]
						}).present();
								
					}
					else {
						this.showError(error);
					}
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
			this.uploadAvatar(() => {
				this.info.profile.Avatar = this.info.avatar.mode == "Avatar"
					? this.info.avatar.uploaded != ""
						? this.info.avatar.uploaded
						: this.info.profile.Avatar
					: "";
				this.authSvc.saveProfileAsync(this.info.profile,
					() => {
						this.info.profile = AppUtility.clone(this.configSvc.getAccount().profile);						
						this.info.avatar.current = AppUtility.getAvatarImage(this.info.profile);
						this.info.avatar.uploaded = "";
						this.cancelUpdate();
					},
					(error: any) => {
						this.showError(error);
					}
				);
			});
		}
	}

	uploadAvatar(onCompleted?: () => void) {
		if (this.info.avatar.mode == "Avatar" && this.cropper.data.image != "" && this.cropper.data.image != this.info.avatar.current) {
			this.http.post(
				AppData.Configuration.app.uris.files + "avatars",
				JSON.stringify({ "Data": this.cropper.data.image }),
				{
					headers: AppAPI.getHeaders({
						"content-type": "application/json",
						"x-as-base64": "yes"
					})
				}
			)
			.map(response => response.json())
			.subscribe(
				(data: any) => {
					this.info.avatar.uploaded = data.Uri;
					this.cropper.data = {
						image: data.Uri,
						original: undefined
					};
					onCompleted && onCompleted();
				},
				(error: any) => {
					console.error("Error occurred while uploading avatar image", error);
					onCompleted && onCompleted();
				}
			);
		}
		else {
			this.info.avatar.uploaded = "";
			onCompleted && onCompleted();
		}
	}
	
	changeAvatar(event: any) {
		var image = new Image();
    var file = event.target.files[0];
    var reader = new FileReader();
    reader.onloadend = (loadEvent: any) => {
			image.src = loadEvent.target.result;
			this.cropperCtrl.setImage(image);
    };
		reader.readAsDataURL(file);
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
							this.info.change.OldPassword = "";
							this.info.change.Password = "";
							this.info.change.ConfirmPassword = "";
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
							this.info.change.OldPassword = "";
							this.info.change.Email = "";
							this.info.change.ConfirmEmail = "";
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
		this.showLoading("Đặt quyền truy cập...");
		this.info.state.processing = true;
		this.authSvc.setPrivilegesAsync(this.info.profile.ID, {
			Privileges: this.permissions.update.role == "Viewer"
				? new List<any>(this.permissions.info.objects)
					.Select(o => AppModels.Privilege.deserialize({
						ServiceName: "books",
						ObjectName: o.value,
						Role: this.permissions.update.privileges[o.value]
					}))
					.ToArray()
				: [AppModels.Privilege.deserialize({
						ServiceName: "books",
						Role: this.permissions.update.role
					})]
			},
			(data: any) => {
				this.preparePrivileges(data);
				this.cancelUpdate();
			},
			(error: any) => {
				this.showError(error);
			}
		);
	}

	// otp
	prepareOTP() {
		this.authSvc.prepareOTPAsync(
			(data: any) => {
				this.info.otp.provisioning = data.Provisioning;
				this.info.otp.url = data.Uri;
				AppUtility.focus(this.otpCtrl, this.keyboard, 234);
			},
			(error: any) => {
				this.showError(error);
			}
		);
	}

	updateOTP() {
		if (AppUtility.isNotEmpty(this.info.otp.value)) {
			this.authSvc.updateOTPAsync(
				{
					Provisioning: this.info.otp.provisioning,
					OTP: this.info.otp.value
				},
				(data: any) => {
					this.openUpdateOTP();
				},
				(error: any) => {
					this.showAlert(
						"Lỗi",
						error.Error && error.Error.Type == "OTPLoginFailedException" ? "Mã xác thực OTP không đúng" : "Đã xảy ra lỗi",
						() => {
							AppUtility.focus(this.otpCtrl, this.keyboard, 234);					
						}
					);
				}
			);
		}
		else {
			AppUtility.focus(this.otpCtrl, this.keyboard, 234);
		}
	}

	deleteOTP(otp: any) {
		this.alertCtrl.create({
			title: "Xoá",
			message: "Chắc chắn muốn huỷ bỏ phương pháp xác thực hai lớp này (" + otp.Type + ")?",
			enableBackdropDismiss: false,
			buttons: [{
				text: "Đóng",
				role: "cancel"
			},
			{
				text: "Đồng ý xoá",
				handler: () => {
					this.authSvc.deleteOTPAsync(otp.Info,
						(data: any) => {
							this.openUpdateOTP();
						}
					);
				}
			}]
		}).present();
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
					role: "cancel"
				},
				{
					text: "Đăng xuất",
					handler: () => {
						this.authSvc.signOutAsync(
							() => {
								AppEvents.broadcast("OpenPage", {
									name: "HomePage",
									component: HomePage,
									doPush: false
								});
							},
							(error: any) => {
								this.showError(error);
							}
						);
					}
				}
			]
		}).present();
	}

	// bookmarks
	buildBookmakrs() {
		this.info.bookmarks = new List(AppData.Configuration.reading.bookmarks.values())
		.Where(b => AppData.Books.getValue(b.ID) != undefined)
		.Select(b => {
			let book = AppData.Books.getValue(b.ID);
			return {
				id: b.ID,
				title: book.Title + (book.Author != "" ? " - " + book.Author : ""),
				position: (b.Chapter > 0 ? "Chương: " + b.Chapter + " - " : "") + "Vị trí: " + b.Position,
				time: b.Time
			};
		})
		.OrderByDescending(b => b.time)
		.ToArray();
	}

	trackBookmark(index: number, bookmark: any) {
		return bookmark.id;
	}

	openBookmark(id: string) {
		this.navCtrl.pop();
		this.navCtrl.push(ReadBookPage, { ID: id });
	}
	
	deleteBookmark(id: string) {
		this.configSvc.deleteBookmark(id, () => {
			this.buildBookmakrs();
		});
	}

}