'use strict';

// idea here is to abstract around the use of chrome.storage.local as it functions differently from "localStorage" and IndexedDB
// localStorage deals with strings, not objects, so the objects have been serialized.
const ConfigStorage = {
    // key can be one string, or array of strings
    get: function(key, callback) {
        let result = {};
        if (Array.isArray(key)) {
            key.forEach(function (element) {
                try {
                    result = {...result, ...JSON.parse(window.localStorage.getItem(element))};
                } catch (e) {
                    // is okay
                }
            });
            callback?.(result);
        } else {
            const keyValue = window.localStorage.getItem(key);
            if (keyValue) {
                try {
                    result = JSON.parse(keyValue);
                } catch (e) {
                    // It's fine if we fail that parse
                }
                callback?.(result);
            } else {
                callback?.(result);
            }
        }

        return result;
    },
    // set takes an object like {'userLanguageSelect':'DEFAULT'}
    set: function(input) {
        Object.keys(input).forEach(function (element) {
            const tmpObj = {};
            tmpObj[element] = input[element];
            window.localStorage.setItem(element, JSON.stringify(tmpObj));
        });
    },
};
