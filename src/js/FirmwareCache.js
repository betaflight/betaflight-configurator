'use strict';

/**
 * Caching of previously downloaded firmwares and release descriptions
 * 
 * Depends on LRUMap for which the docs can be found here:
 * https://github.com/rsms/js-lru
 */

/**
 * @typedef {object} Descriptor Release descriptor object
 * @property {string} releaseUrl
 * @property {string} name
 * @property {string} version
 * @property {string} url
 * @property {string} file
 * @property {string} target
 * @property {string} date
 * @property {string} notes
 * @property {string} status
 * @see buildBoardOptions() in {@link release_checker.js}
 */

/**
 * @typedef {object} CacheItem
 * @property {Descriptor} release
 * @property {string} hexdata
 */

/**
 * Manages caching of downloaded firmware files
 */
let FirmwareCache = (function () {

    let onPutToCacheCallback,
        onRemoveFromCacheCallback;

    let JournalStorage = (function () {
        let CACHEKEY = "firmware-cache-journal";

        /**
         * @param {Array} data LRU key-value pairs
         */
        function persist(data) {
            let obj = {};
            obj[CACHEKEY] = data;
            chrome.storage.local.set(obj);
        }

        /**
         * @param {Function} callback 
         */
        function load(callback) {
            chrome.storage.local.get(CACHEKEY, obj => {
                let entries = typeof obj === "object" && obj.hasOwnProperty(CACHEKEY)
                    ? obj[CACHEKEY]
                    : [];
                callback(entries);
            });
        }

        return {
            persist: persist,
            load: load,
        };
    })();

    let journal = new LRUMap(100),
        journalLoaded = false;

    journal.shift = function () {
        // remove cached data for oldest release
        let oldest = LRUMap.prototype.shift.call(this);
        if (oldest === undefined) {
            return undefined;
        }
        let key = oldest[0];
        let cacheKey = withCachePrefix(key);
        chrome.storage.local.get(cacheKey, obj => {
            /** @type {CacheItem} */
            let cached = typeof obj === "object" && obj.hasOwnProperty(cacheKey)
                ? obj[cacheKey]
                : null;
            if (cached === null) {
                return;
            }
            chrome.storage.local.remove(cacheKey, () => {
                onRemoveFromCache(cached.release);
            });
        });
        return oldest;
    };

    /**
     * @param {Descriptor} release 
     * @returns {string} A key used to store a release in the journal
     */
    function keyOf(release) {
        return release.file;
    }

    /**
     * @param {string} key 
     * @returns {string} A key for storing cached data for a release
     */
    function withCachePrefix(key) {
        return "cache:" + key;
    }

    /**
     * @param {Descriptor} release
     * @returns {boolean}
     */
    function has(release) {
        if (!release) {
            return false;
        }
        if (!journalLoaded) {
            console.warn("Cache not yet loaded");
            return false;
        }
        return journal.has(keyOf(release));
    }

    /**
     * @param {Descriptor} release
     * @param {string} hexdata
     */
    function put(release, hexdata) {
        if (!journalLoaded) {
            console.warn("Cache journal not yet loaded");
            return;
        }
        let key = keyOf(release);
        if (has(release)) {
            console.debug("Firmware is already cached: " + key);
            return;
        }
        journal.set(key, true);
        JournalStorage.persist(journal.toJSON());
        let obj = {};
        obj[withCachePrefix(key)] = {
            release: release,
            hexdata: hexdata,
        };
        chrome.storage.local.set(obj, () => {
            onPutToCache(release);
        });
    }

    /**
     * @param {Descriptor} release
     * @param {Function} callback
     */
    function get(release, callback) {
        if (!journalLoaded) {
            console.warn("Cache journal not yet loaded");
            return undefined;
        }
        let key = keyOf(release);
        if (!has(release)) {
            console.debug("Firmware is not cached: " + key);
            return;
        }
        let cacheKey = withCachePrefix(key);
        chrome.storage.local.get(cacheKey, obj => {
            /** @type {CacheItem} */
            let cached = typeof obj === "object" && obj.hasOwnProperty(cacheKey)
                ? obj[cacheKey]
                : null;
            callback(cached);
        });
    }

    /**
     * Remove all cached data
     */
    function invalidate() {
        if (!journalLoaded) {
            console.warn("Cache journal not yet loaded");
            return undefined;
        }
        let cacheKeys = [];
        for (let key of journal.keys()) {
            cacheKeys.push(withCachePrefix(key));
        }
        chrome.storage.local.get(cacheKeys, obj => {
            if (typeof obj !== "object") {
                return;
            }
            for (let cacheKey of cacheKeys) {
                if (obj.hasOwnProperty(cacheKey)) {
                    /** @type {CacheItem} */
                    let item = obj[cacheKey];
                    onRemoveFromCache(item.release);
                }
            }
            chrome.storage.local.remove(cacheKeys);
        });
        journal.clear();
        JournalStorage.persist(journal.toJSON());    
    }

    /**
     * @param {Descriptor} release 
     */
    function onPutToCache(release) {
        if (typeof onPutToCacheCallback === "function") {
            onPutToCacheCallback(release);
        }
        console.info("Release put to cache: " + keyOf(release));
    }

    /**
     * @param {Descriptor} release 
     */
    function onRemoveFromCache(release) {
        if (typeof onRemoveFromCacheCallback === "function") {
            onRemoveFromCacheCallback(release);
        }
        console.debug("Cache data removed: " + keyOf(release));
    }

    /**
     * @param {Array} entries 
     */
    function onEntriesLoaded(entries) {
        let pairs = [];
        for (let entry of entries) {
            pairs.push([entry.key, entry.value]);
        }
        journal.assign(pairs);
        journalLoaded = true;
        console.info("Firmware cache journal loaded; number of entries: " + entries.length);
    }

    return {
        has: has,
        put: put,
        get: get,
        onPutToCache: callback => onPutToCacheCallback = callback,
        onRemoveFromCache: callback => onRemoveFromCacheCallback = callback,
        load: () => {
            JournalStorage.load(onEntriesLoaded);
        },
        unload: () => {
            JournalStorage.persist(journal.toJSON());
            journal.clear();
        },
        invalidate: invalidate,
    };
})();
