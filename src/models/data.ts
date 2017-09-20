import * as Collections from "typescript-collections";

import { AppUtility } from "../helpers/utility";
import { AppModels } from "./objects";

export namespace AppData {

	/** App configuration settings */
	export var Configuration = {
		app: {
			uris: {
				apis: "https://apis.vieapps.net/",
				files: "https://afs.vieapps.net/",
				activations: "http://viebooks.net/"
			},
			debug: true,
			offline: false,
			mode: "",
			platform: "",
			name: "viebooks.net",
			host: "",
			tracking: {
				google: "UA-3060572-8",
				googleDomains: ["chomuonsach.com"],
				facebook: ""
			},
			refer: {
				id: null,
				section: null
			}
		},
		session: {
			id: null,
			jwt: null,
			account: null,
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
			version: "v2.9",
		}
	};

	/** Statistics */
	export var Statistics = new AppModels.Statistics();

	/** Accounts */
	export var Accounts = new Collections.Dictionary<string, AppModels.Account>();

	/** Books */
	export var Books = new Collections.Dictionary<string, AppModels.Book>();

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
			if (Paginations.getQuery(info) != null) {
				return undefined;
			}

			prefix = AppUtility.isNotEmpty(prefix) ? prefix : "B";
			
			var filterby = Paginations.getFilterBy(info);

			var sortby = Paginations.getSortBy(info);
			if (!AppUtility.isObject(sortby, true)) {
				sortby = "Descending";
			}
			else {
				if (prefix == "B") {
					sortby = AppUtility.isNotEmpty(sortby.LastUpdated)
						? sortby.LastUpdated as string
						: "Descending"
				}
				else if (prefix == "A") {
					sortby = AppUtility.isNotEmpty(sortby.Name)
					? sortby.Name as string
					: "Ascending"
				}
				else {
					sortby = "Descending";
				}
			}

			var key: string = undefined;

			// books
			if (prefix == "B") {
				key = "Descending" != sortby 
					? null
					: filterby && filterby.And && filterby.And.Category && AppUtility.isNotEmpty(filterby.And.Category.Equals)
						? prefix + "CAT-" + filterby.And.Category.Equals
						: filterby && filterby.And && filterby.And.Author && AppUtility.isNotEmpty(filterby.And.Author.Equals)
							? prefix + "AUT-" + filterby.And.Author.Equals
							: prefix;
			}

			// accounts
			else if (prefix == "A") {
				key = "Ascending" != sortby 
					? null
					: filterby && filterby.And && filterby.And.Province && AppUtility.isNotEmpty(filterby.And.Province.Equals)
						? prefix + "PRO-" + filterby.And.Province.Equals
						: prefix;
			}

			// others
			else {
				key = prefix;
			}

			return key;
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