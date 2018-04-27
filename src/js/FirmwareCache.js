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
 * @property {string} [hexdata]
 */

 /**
  * Manages caching of downloaded firmware files
  */
let FirmwareCache = (function() {

    let MetadataStorage = (function() {
        let CACHEKEY = "firmware-cache-metadata";

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

    let metadataCache = new LRUMap(100);
    let metadataLoaded = false;

    metadataCache.shift = function() {
        // remove hexdata for oldest release
        let oldest = LRUMap.prototype.shift.call(this);
        if (oldest !== undefined) {
            /** @type {CacheItem} */
            let cached = oldest[1];
            let hexdataKey = withHexdataPrefix(keyOf(cached.release));
            chrome.storage.local.remove(hexdataKey, 
                () => console.debug("Hex data removed: " + hexdataKey));
        }
        return oldest;
    };

    /**
     * @param {Descriptor} release 
     * @returns {string} A key used for caching the metadata for a release
     */
    function keyOf(release) {
        return release.file;
    }

    /**
     * @param {string} key 
     * @returns {string} A key for storing the hex data for a release
     */
    function withHexdataPrefix(key) {
        return "hex:" + key;
    }

    /**
     * @param {Descriptor} release
     * @returns {boolean}
     */
    function has(release) {
        if (!metadataLoaded) {
            console.warn("Cache not yet loaded");
            return false;
        }
        return metadataCache.has(keyOf(release));
    }

    /**
     * @param {Descriptor} release
     * @param {string} hexdata
     */
    function put(release, hexdata) {
        if (!metadataLoaded) {
            console.warn("Cache not yet loaded");
            return;
        }
        if (has(release)) {
            console.debug("Firmware is already cached: " + keyOf(release));
            return;
        }
        let key = keyOf(release);
        let hexdataKey = withHexdataPrefix(key);
        metadataCache.set(key, {
            release: release,
        });
        MetadataStorage.persist(metadataCache.toJSON());
        let obj = {};
        obj[hexdataKey] = hexdata;
        chrome.storage.local.set(obj);
    }

    /**
     * @param {Descriptor} release
     * @param {Function} callback
     * @returns {(CacheItem|undefined)}
     */
    function get(release, callback) {
        if (!metadataLoaded) {
            console.warn("Cache not yet loaded");
            return undefined;
        }
        let key = keyOf(release);
        /** @type {CacheItem} */
        let cached = metadataCache.get(key);
        if (cached !== undefined) {
            let hexdataKey = withHexdataPrefix(key);
            chrome.storage.local.get(hexdataKey, function(obj) {
                cached.hexdata = typeof obj === "object" && obj.hasOwnProperty(hexdataKey) 
                    ? obj[hexdataKey]
                    : null;
                callback(cached);
            });
        }
        return cached;
    }

    /**
     * @param {Array} entries 
     */
    function onEntriesLoaded(entries) {
        let pairs = [];
        for (let entry of entries) {
            pairs.push([entry.key, entry.value]);
        }
        metadataCache.assign(pairs);
        metadataLoaded = true;
        console.info("Firmware cache loaded; number of entries: " + entries.length);
    }

    return {
        has: has,
        put: put,
        get: get,
        load: () => {
            MetadataStorage.load(onEntriesLoaded);
        },
        flush: () => {
            MetadataStorage.persist(metadataCache.toJSON());
            metadataCache.clear();
        },
    };
})();
