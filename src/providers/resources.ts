import { Injectable } from "@angular/core";
import { Http } from "@angular/http";
import { Storage } from "@ionic/storage";
import "rxjs/add/operator/toPromise";

import { AppUtility } from "../helpers/utility";
import { AppAPI } from "../helpers/api";
import { AppEvents } from "../helpers/events";

import { AppData } from "../models/data";

@Injectable()
export class ResourcesService {

	constructor(public http: Http, public storage: Storage) {
		AppAPI.setHttp(this.http);
	}

	// working with remote resources
	async fetchResourceAsync(onNext?: () => void, onError?: (e: any) => void) {
		try {
			let path = "statics/services/books.json";
			let response = await AppAPI.GetAsync(path);
			AppData.Configuration.resources = response.json()
			onNext != undefined && onNext();
		}
		catch (e) {
			console.error("[Resources]: Error occurred while fetching the remote resource", e);
			onError != undefined && onError(e);
		}
	}

	// working with geo-meta
	async loadGeoMetaAsync() {
		let data = await this.storage.get("VIEApps-GeoMeta");
		if (AppUtility.isNotEmpty(data)) {
			AppData.Configuration.meta = JSON.parse(data as string);
		}

		if (!AppUtility.isNotEmpty(AppData.Configuration.meta.country)) {
			AppData.Configuration.meta.country = "VN";
		}

		if (!AppData.Configuration.meta.provinces[AppData.Configuration.meta.country]) {
			await this.loadGeoProvincesAsync(AppData.Configuration.meta.country, () => {
				this.loadGeoCountriesAsync();
			});
		}
		else {
			AppEvents.broadcast("GeoMetaIsLoaded", AppData.Configuration.meta);
		}
	}

	async loadGeoCountriesAsync(onCompleted?: () => void) {
		try {
			let path = "statics/geo/countries.json";
			let response = await AppAPI.GetAsync(path);
			await this.saveGeoMetaAsync(response.json(), onCompleted);
		}
		catch (e) {
			console.error("[Resources]: Error occurred while fetching the meta countries", e);
		}
	}

	async loadGeoProvincesAsync(country?: string, onCompleted?: () => void) {
		try {
			let path = "statics/geo/provinces/" + (country || AppData.Configuration.meta.country) + ".json";
			let response = await AppAPI.GetAsync(path);
			await this.saveGeoMetaAsync(response.json(), onCompleted);
		}
		catch (e) {
			console.error("[Resources]: Error occurred while fetching the meta provinces", e);
		}
	}

	async saveGeoMetaAsync(data: any, onCompleted?: () => void) {
		if (AppUtility.isObject(data, true) && AppUtility.isNotEmpty(data.code) && AppUtility.isArray(data.provinces)) {
			AppData.Configuration.meta.provinces[data.code] = data;
		}
		else if (AppUtility.isObject(data, true) && AppUtility.isArray(data.countries)) {
			AppData.Configuration.meta.countries = data.countries;
		}

		await this.storage.set("VIEApps-GeoMeta", JSON.stringify(AppData.Configuration.meta));
		AppEvents.broadcast("GeoMetaIsLoaded", AppData.Configuration.meta);
		onCompleted != undefined && await onCompleted();
	}

}