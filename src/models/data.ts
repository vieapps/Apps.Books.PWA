import * as Collections from "typescript-collections";

import { AppUtility } from "../components/utility";
import { AppCrypto } from "../components/crypto";
import { AppModels } from "./objects";

export namespace AppData {

	/** App configuration settings */
	export var Configuration = {
		app: {
			uris: {
				apis: "https://apis.vieapps.net/",
				files: "https://afs.vieapps.net/",
				// apis: "https://apis.prj.vn/",
				// files: "https://afs.prj.vn/",
				// apis: "http://local-apis.vieapps.net/",
				// files: "http://local-afs.vieapps.net/",
				activations: "http://viebooks.net/"
			},
			version: "0.5",
			debug: true,
			offline: false,
			mode: "",
			platform: "",
			name: "viebooks.net",
			host: "",
			tracking: {
				google: "UA-3060572-8",
				googleDomains: ["viebooks.net", "books.vieapps.net", "books.prj.vn"],
				facebook: ""
			},
			refer: {
				id: null,
				section: null
			},
			registrable: true
		},
		session: {
			id: null as string,
			jwt: null,
			account: null as Account,
			keys: null,
			device: "",
			captcha: {
				code: "",
				uri: ""
			}
		},
		reading: {
			options: {
				font: "default",
				size: "normal",
				color: "white",
				paragraph: "one",
				align: "align-left"
			},
			bookmarks: new Collections.Dictionary<string, AppModels.Bookmark>()
		},
		meta: {
			country: "VN",
			countries: [],
			provinces: {}
		},
		resources: {},
		facebook: {
			id: null,
			token: null,
			url: null,
			version: "v2.12",
		}
	};

	/** Account (of the app) */
	export class Account {
		id: string = null;
		roles: Array<string> = null;
		privileges: Array<AppModels.Privilege> = null;
		status: string = null;
		twoFactors: { required: boolean, providers: Array<{Label: string, Type: string, Time: Date, Info: string}> } = { required: false, providers: new Array<{Label: string, Type: string, Time: Date, Info: string}>() };
		profile: AppModels.Account = null;
		facebook = {
			id: null as string,
			name: null as string,
			pictureUrl: null as string,
			profileUrl: null as string
		};
	}

	/** Accounts */
	export var Accounts = new Collections.Dictionary<string, AppModels.Account>();

	/** Books */
	export var Books = new Collections.Dictionary<string, AppModels.Book>();

	/** Statistics */
	export var Statistics = new AppModels.Statistics();
	
	/** Paginations */
	export var Paginations = {
		info: {},

		getFilterBy: (info?: any) => {
			return AppUtility.isObject(info, true) && AppUtility.isObject(info.FilterBy, true)
				? info.FilterBy
				: undefined;
		},

		getQuery: (info?: any) => {
			var filterby = Paginations.getFilterBy(info);
			return AppUtility.isObject(filterby, true) && AppUtility.isObject(filterby.FilterBy, true) && AppUtility.isNotEmpty(filterby.FilterBy.Query)
				? filterby.FilterBy.Query as string
				: undefined;
		},

		getSortBy: (info?: any) => {
			return AppUtility.isObject(info, true) && AppUtility.isObject(info.SortBy, true)
				? info.SortBy
				: undefined;
		},

		getKey: (info?: any, prefix?: string) => {
			if (Paginations.getQuery(info)) {
				return undefined;
			}

			prefix = AppUtility.isNotEmpty(prefix) ? prefix : "O";
			let filterby = AppUtility.clean(Paginations.getFilterBy(info) || {});
			let sortby = AppUtility.clean(Paginations.getSortBy(info) || {});
			return prefix + ":" + AppCrypto.md5((JSON.stringify(filterby) + JSON.stringify(sortby)).toLowerCase());
		},

		/** Gets the default pagination */
		default: (info?: any): { TotalRecords: number, TotalPages: number, PageSize: number, PageNumber: number } => {
			var pagination = info != undefined
				? info.Pagination
				: undefined;

			return AppUtility.isObject(pagination, true)
				? {
					TotalRecords: pagination.TotalRecords ? pagination.TotalRecords : -1,
					TotalPages: pagination.TotalPages ? pagination.TotalPages : 0,
					PageSize: pagination.PageSize ? pagination.PageSize : 20,
					PageNumber: pagination.PageNumber ? pagination.PageNumber : 0
				}
				: {
					TotalRecords: -1,
					TotalPages: 0,
					PageSize: 20,
					PageNumber: 0
				};
		},

		/** Computes the total of records */
		computeTotal: (pageNumber: number, pagination?: any) => {
			var totalRecords = pageNumber * (AppUtility.isObject(pagination, true) ? pagination.PageSize : 20);
			if (AppUtility.isObject(pagination, true) && totalRecords > pagination.TotalRecords) {
				totalRecords = pagination.TotalRecords;
			}
			return totalRecords;
		},

		/** Gets a pagination */
		get: (info?: any, prefix?: string) => {
			var key = Paginations.getKey(info, prefix);
			return key ? Paginations.info[key] : undefined;
		},

		/** Sets a pagination */
		set: (info?: any, prefix?: string) => {
			var key = Paginations.getKey(info, prefix);
			if (key) {
				Paginations.info[key] = Paginations.default(info);
			}
		},

		/** Removes a pagination */
		remove: (info?: any, prefix?: string) => {
			var key = Paginations.getKey(info, prefix);
			if (key) {
				delete Paginations.info[key];
			}
		}
	};

	/** Builds the well-formed request for working with REST API */
	export function buildRequest(filterBy?: any, sortBy?: any, pagination?: any, onPreCompleted?: (request: { FilterBy: any, SortBy: any, Pagination: any }) => void): { FilterBy: any, SortBy: any, Pagination: any } {
		var request = {
			FilterBy: AppUtility.isObject(filterBy, true)
				? AppUtility.clone(filterBy)
				: {},
			SortBy: AppUtility.isObject(sortBy, true)
				? AppUtility.clone(sortBy)
				: {},
			Pagination: Paginations.default({
				Pagination: AppUtility.isObject(pagination, true)
					? AppUtility.clone(pagination)
					: undefined 
			})
		};
		onPreCompleted != undefined && onPreCompleted(request);
		return request;
	}

}