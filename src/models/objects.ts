import * as Collections from "typescript-collections";
import { List } from "linqts";

import { AppUtility } from "../components/utility";
import { AppData } from "./data";

export namespace AppModels {
	/** Base of all model classes */
	export abstract class Base {
		abstract ID: string = "";

		/** Copys data from source (object or JSON) and fill into this objects' properties */
		copy(source: any, onCompleted?: (data: any) => void) {
			AppUtility.copy(source, this, onCompleted);
		}
	}

	/** Present details information of an account */
	export class Account extends Base {
		ID = "";
		Name = "";
		FirstName = "";
		LastName = "";
		BirthDay = "";
		Gender = "";
		Address = "";
		County = "";
		Province = "";
		Country = "";
		PostalCode = "";
		Email = "";
		Mobile = "";
		Avatar = "";
		Gravatar = "";
		Alias = "";
		Bio = "";
		Notes = "";
		Level = "";
		Reputation = "";
		TotalPoints = 0;
		RestPoints = 0;
		TotalRewards = 0;
		TotalContributions = 0;
		LastUpdated = new Date();
		LastSync = new Date();
		RatingPoints = new Collections.Dictionary<string, RatingPoint>();

		Status = "";
		Joined = new Date();
		LastAccess = new Date();

		IsOnline = false;
		Title = "";
		FullAddress = "";

		constructor() {
			super();
			this.Gender = "NotProvided";
			this.Status = "Activated";
			this.Level = "Normal";
			this.Reputation = "Unknown";
		}

		static deserialize(json: any) {
			var account = new Account();
			AppUtility.copy(json, account, (data: any) => {
				account.RatingPoints = new Collections.Dictionary<string, RatingPoint>();
				if (AppUtility.isArray(data.RatingPoints)) {
					new List<any>(data.RatingPoints).ForEach(r => account.RatingPoints.setValue(r.Type, RatingPoint.deserialize(r)));
				}

				if (AppUtility.isNotEmpty(account.BirthDay)) {
					account.BirthDay = account.BirthDay.replace(/--/g, "01").replace(/\//g, "-");
				}

				account.FullAddress = account.Address
					+ (AppUtility.isNotEmpty(account.Province) ? (AppUtility.isNotEmpty(account.Address) ? ", " : "")
					+ account.County + ", " + account.Province + ", " + account.Country : "");
				account.Title = AppUtility.toANSI(account.Name + " " + account.FullAddress + " " + account.Email + " " + account.Mobile).toLowerCase();
			});
			return account;
		}

		static update(data: any) {
			if (AppUtility.isObject(data, true)) {
				var account = data instanceof Account
					? data as Account
					: Account.deserialize(data);
				if (AppData.Configuration.session.jwt != null && AppData.Configuration.session.jwt.uid == account.ID) {
					account.IsOnline = true;
				}
				AppData.Accounts.setValue(account.ID, account);
			}
		}
	}

	/** Present details information of a book */
	export class Book extends Base {
		ID = "";
		Title = "";
		Author = "";
		Translator = "";
		Category = "";
		Original = "";
		Publisher = "";
		Producer = "";
		Language = "";
		Status = "";
		Cover = "";
		Tags = "";
		Source = "";
		SourceUrl = "";
		Contributor = "";
		TotalChapters = 0;
		Counters: Collections.Dictionary<string, CounterInfo> = undefined;
		RatingPoints: Collections.Dictionary<string, RatingPoint> = undefined;
		LastUpdated = new Date();

		TOCs = new Array<string>();
		Chapters = new Array<string>();
		Body = "";
		Files = {
			Epub: {
				Size: "generating...",
				Url: ""
			},
			Mobi: {
				Size: "generating...",
				Url: ""
			}
		};
		
		ANSITitle = "";
		
		/** Initializes a new instance of book */
		constructor() {
			super();
			this.Language = "vi";
		}

		static deserialize(json: any, book?: Book) {
			book = book || new Book();
			AppUtility.copy(json, book, (data: any) => {
				book.Counters = new Collections.Dictionary<string, CounterInfo>();
				new List<any>(data.Counters).ForEach(c => book.Counters.setValue(c.Type, CounterInfo.deserialize(c)));

				book.RatingPoints = new Collections.Dictionary<string, RatingPoint>();
				new List<any>(data.RatingPoints).ForEach(r => book.RatingPoints.setValue(r.Type, RatingPoint.deserialize(r)));
			
				if (book.SourceUrl != "" && AppUtility.isNativeApp()) {
					book.SourceUrl = "";
				}
	
				book.Chapters = book.TotalChapters > 1 && book.Chapters.length < 1
					? new List(book.TOCs).Select(t => "").ToArray()
					: book.Chapters;
	
				book.ANSITitle = AppUtility.toANSI(book.Title + " " + book.Author).toLowerCase();
			});
			
			return book;
		}

		static update(data: any) {
			if (AppUtility.isObject(data, true)) {
				let book = data instanceof Book
					? data as Book
					: Book.deserialize(data, AppData.Books.getValue(data.ID));
				AppData.Books.setValue(book.ID, book);
			}
		}
	}

	/** Access privilege */
	export class Privilege {
		ServiceName = "";
		ObjectName = "";
		ObjectIdentity = "";
		Role = "";
		Actions = new Array<string>();

		static deserialize(json: any, privilege?: Privilege) {
			privilege = privilege || new Privilege();
			AppUtility.copy(json, privilege);
			return privilege;
		}
	}

	/** Contact information */
	export class ContactInfo {
		Name = "";
		Title = "";
		Phone = "";
		Email = "";
		Address = "";
		County = "";
		Province = "";
		Country = "";
		PostalCode = "";
		Notes = "";
		GPSLocation = "";

		static deserialize(json: any) {
			var obj = new ContactInfo();
			AppUtility.copy(json, obj);
			return obj;
		}
	}

	/** Rating information */
	export class RatingPoint {
		Type = "";
		Total = 0;
		Points = 0.0;
		Average = 0.0;

		static deserialize(json: any) {
			var obj = new RatingPoint();
			AppUtility.copy(json, obj);
			return obj;
		}
	}

	/** Bookmark of an e-book */
	export class Bookmark {
		ID = "";
		Chapter = 0;
		Position = 0;
		Time = new Date();

		static deserialize(json: any) {
			var obj = new Bookmark();
			AppUtility.copy(json, obj);
			return obj;
		}
	}

	/** Based-Counter information */
	export class CounterBase {
		Type = "";
		Total = 0;

		constructor(type?: string, total?: number) {
			if (AppUtility.isNotEmpty(type) && total != undefined) {
				this.Type = type;
				this.Total = total;
			}
		}

		static deserialize(json: any) {
			var obj = new CounterBase();
			AppUtility.copy(json, obj);
			return obj;
		}
	}

	/** Counter information */
	export class CounterInfo extends CounterBase {
		LastUpdated = new Date();
		Month = 0;
		Week = 0;

		static deserialize(json: any) {
			var obj = new CounterInfo();
			AppUtility.copy(json, obj);
			return obj;
		}
	}

	/** Based-Statistic information */
	export class StatisticBase {
		Name = "";
		Title = "";
		Counters = 0;

		static deserialize(json: any) {
			var statistic = new StatisticBase();
			AppUtility.copy(json, statistic, (d: any) => {
				statistic.Title = AppUtility.toANSI(statistic.Name).toLowerCase();
			});
			return statistic;
		}
	}

	/** Statistic information */
	export class StatisticInfo extends StatisticBase {
		FullName = "";
		Children: Array<StatisticInfo> = [];

		static deserialize(json: any) {
			var statistic = new StatisticInfo();
			AppUtility.copy(json, statistic, (data: any) => {
				statistic.FullName = statistic.Name;
				statistic.Title = AppUtility.toANSI(statistic.FullName).toLowerCase();
				statistic.Children = !AppUtility.isArray(data.Children)
					? []
					: new List<any>(data.Children)
						.Select(c => {
							let child = new StatisticInfo();
							AppUtility.copy(c, child);
							child.FullName = statistic.Name + " > " + child.Name;
							child.Title = AppUtility.toANSI(child.FullName).toLowerCase();
							return child;
						})
						.ToArray();
			});
			return statistic;
		}

		toJSON() {
			var json = {
				Name: this.Name,
				Counters: this.Counters,
				Children: []
			};

			json.Children = new List(this.Children)
				.Select(c => {
					return { Name: c.Name, Counters: c.Counters }
				})
				.ToArray();

			return JSON.stringify(json);
		}
	}

	/** All available statistics */
	export class Statistics {
		Categories = new Array<StatisticInfo>();
		Authors = new Collections.Dictionary<string, Array<StatisticBase>>();
		Status = new Array<StatisticBase>();
	}
	
}