import CryptoJS from "crypto-js";
declare var RSA: any;

export namespace AppCrypto {
	var rsa = undefined;
	var aes = { key: undefined, iv: undefined };

	/** Gets the base64url-encoded string from the base64 string */
	export function getBase64Url(text: string) {
		return text.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
	}

	/** Gets the base64 string from the base64url-encoded string */
	export function getBase64Str(text: string) {
		var result = text.replace(/\-/g, "+").replace(/\_/g, "/");
		switch (result.length % 4) {
			case 0:
				break;
			case 2:
				result += "==";
				break;
			case 3:
				result += "=";
				break;
			default:
				throw "Illegal base64url string!";
		}
		return result;
	}

	/** Hashs the string to MD5 */
	export function md5(text: string) {
		return CryptoJS.MD5(text).toString() as string;
	}

	/** Signs the string with the specified key using HMAC SHA256 */
	export function hmacSign(text: string, key: string) {
		return CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(text, key)) as string;
	}

	/** Signs the string with the specified key using HMAC SHA256 and encode as Base64Url string */
	export function urlSign(text: string, key: string) {
		return getBase64Url(hmacSign(text, key));
	}

	/** Encodes the string by Base64Url */
	export function urlEncode(text: string) {
		return getBase64Url(CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(text)));
	}

	/** Decodes the string by Base64Url */
	export function urlDecode(text: string) {
		return CryptoJS.enc.Utf8.stringify(CryptoJS.enc.Base64.parse(getBase64Str(text))) as string;
	}

	/** Encodes the JSON Web Token */
	export function jwtEncode(jwt: any, key: string) {
		jwt.iat = Math.round(+new Date() / 1000);
		let encoded = urlEncode(JSON.stringify({ typ: "JWT", alg: "HS256" })) + "." + urlEncode(JSON.stringify(jwt));
		return encoded + "." + urlSign(encoded, key);
	}

	/** Decodes the JSON Web Token */
	export function jwtDecode(jwt: string, key: string) {
		let elements = jwt.split(".");
		return urlSign(elements[0] + "." + elements[1], key) == elements[2]
			? JSON.parse(urlDecode(elements[1]))
			: null;
	}

	export function rsaInit(exponent: string, modulus: string) {
		rsa = rsa || new RSA();
		rsa.init(exponent, modulus);
	}

	/** Encrypts the string by RSA */
	export function rsaEncrypt(text: string) {
		return rsa.encrypt(text) as string;
	}

	export function aesInit(key: string, iv: string) {
		aes.key = CryptoJS.enc.Hex.parse(key);
		aes.iv = CryptoJS.enc.Hex.parse(iv);
	}

	/** Encrypts the string by AES */
	export function aesEncrypt(text: string, key?: any, iv?: any) {
		return CryptoJS.AES.encrypt(text, key || aes.key, { iv: iv || aes.iv }).ciphertext.toString(CryptoJS.enc.Base64) as string;
	}

	/** Decrypts the string by AES */
	export function aesDecrypt(text: string, key?: any, iv?: any) {
		return CryptoJS.AES.decrypt(text, key || aes.key, { iv: iv || aes.iv }).toString(CryptoJS.enc.Utf8) as string;
	}

	export function initKeys(keys: any) {
		if (keys.aes != undefined && keys.aes != null) {
			aesInit(keys.aes.key, keys.aes.iv);
		}
		if (keys.rsa != undefined && keys.rsa != null) {
			rsaInit(keys.rsa.exponent, keys.rsa.modulus);
		}
	}
}
