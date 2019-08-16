'use strict';

// idea here is to abstract around the use of chrome.storage.local as it functions differently from "localStorage" and IndexedDB
// localStorage deals with strings, not objects, so the objects have been serialized.
var ConfigStorage = {
    // key can be one string, or array of strings
    get: function(key, callback) {
      if (GUI.isChromeApp()) {
        chrome.storage.local.get(key,callback);
      } else {
        //console.log('Abstraction.get',key);
        if (Array.isArray(key)) {
            var obj = {};
            key.forEach(function (element) {
                try {
                    obj = {...obj, ...JSON.parse(window.localStorage.getItem(element))};
                } catch (e) {
                    // is okay
                }
            });
            callback(obj);
        } else {
            var keyValue = window.localStorage.getItem(key);
            if (keyValue) {
                var obj = {};
                try {
                    obj = JSON.parse(keyValue);
                } catch (e) {
                    // It's fine if we fail that parse
                }
                callback(obj);
            } else {
                callback({});
            }
        }
      }
    },
    // set takes an object like {'userLanguageSelect':'DEFAULT'}
    set: function(input) {
      if (GUI.isChromeApp()) {
          chrome.storage.local.set(input);
      } else {
        //console.log('Abstraction.set',input);
        Object.keys(input).forEach(function (element) {
            var tmpObj = {};
            tmpObj[element] = input[element];
            window.localStorage.setItem(element, JSON.stringify(tmpObj));
        });
      }
    }
}
