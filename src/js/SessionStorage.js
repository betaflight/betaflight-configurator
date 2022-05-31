'use strict';

const SessionStorage = {
    // key can be one string, or array of strings
    get: function(key) {
        let result = {};
        if (Array.isArray(key)) {
            key.forEach(function (element) {
                try {
                    result = {...result, ...JSON.parse(sessionStorage.getItem(element))};
                } catch (e) {
                    console.error(e);
                }
            });
        } else {
            const keyValue = sessionStorage.getItem(key);
            if (keyValue) {
                try {
                    result = JSON.parse(keyValue);
                } catch (e) {
                    console.error(e);
                }
            }
        }

        return result;
    },
    set: function(input) {
        Object.keys(input).forEach(function (element) {
            const tmpObj = {};
            tmpObj[element] = input[element];
            try {
                sessionStorage.setItem(element, JSON.stringify(tmpObj));
            } catch (e) {
                console.error(e);
            }
        });
    },
    remove: function(item) {
        sessionStorage.removeItem(item);
    },
    clear: function() {
        sessionStorage.clear();
    },
};
