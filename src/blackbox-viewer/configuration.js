/**
 * Configuration
 *
 * Handle loading of configuration dump/diff files.
 * Parsed lines are pushed to graphStore for Vue rendering.
 */

import { useGraphStore } from "./stores/graph.js";

export function Configuration(file) {
    let fileData;

    function loadFile(file) {
        fileData = file;
        const reader = new FileReader();

        reader.onload = function (e) {
            const graphStore = useGraphStore();
            graphStore.configLines = e.target.result.split("\n");
            graphStore.configFileName = file.name;
        };
        reader.onerror = reader.onabort = function () {
            const graphStore = useGraphStore();
            graphStore.configLines = [];
            graphStore.configFileName = "";
        };

        reader.readAsText(file);
    }

    this.getFile = function () {
        return fileData;
    };

    loadFile(file);
}

export function ConfigurationDefaults(prefs) {
    // Special configuration file that handles default values only

    let fileData;
    let fileLinesArray = null;

    function loadFileFromCache() {
        prefs.get("configurationDefaults", function (item) {
            if (item) {
                fileLinesArray = item;
            } else {
                fileLinesArray = null;
            }
        });
    }

    this.loadFile = function (file) {
        const reader = new FileReader();
        fileData = file;

        reader.onload = function (e) {
            fileLinesArray = e.target.result.split("\n");
            prefs.set("configurationDefaults", fileLinesArray);
        };
        reader.onerror = reader.onabort = function () {
            fileLinesArray = null;
        };

        reader.readAsText(file);
    };

    this.getFile = function () {
        return fileData;
    };

    this.getLines = function () {
        return fileLinesArray;
    };

    this.hasDefaults = function () {
        return fileLinesArray !== null;
    };

    this.isDefault = function (line) {
        if (!fileLinesArray) {
            return true;
        }
        for (const fileLine of fileLinesArray) {
            if (line !== fileLine) {
                continue;
            }
            return true;
        }
        return false;
    };

    loadFileFromCache();
}
