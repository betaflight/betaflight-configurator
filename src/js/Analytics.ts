/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import ShortUniqueId from "short-unique-id";
import { set as setConfig, get as getConfig } from "./ConfigStorage";
import GUI from "./gui";
import CONFIGURATOR from "./data_storage";

export interface AnalyticsSettings {
    sessionId: string;
    userId: string;
    appName: string;
    appVersion: string;
    gitRevision: string;
    os: string | null;
    checkForDebugVersions: boolean;
    optOut: boolean;
}

interface AnalyticsConfig {
    userId?: string;
    analyticsOptOut?: unknown;
    checkForConfiguratorUnstableVersions?: unknown;
}

declare global {
    interface Window {
        tracking: Analytics | null;
    }
}

// null until checkSetupAnalytics() has run, which main.js does at startup.
let tracking: Analytics | null = null;
export { tracking };

export function createAnalytics(settings: AnalyticsSettings) {
    tracking = new Analytics(settings);
}

function setupAnalytics(result: AnalyticsConfig) {
    const uid = new ShortUniqueId();

    let userId;
    if (result.userId) {
        userId = result.userId;
    } else {
        userId = uid.randomUUID(13);
        setConfig({ userId: userId });
    }

    const optOut = !!result.analyticsOptOut;
    const checkForDebugVersions = !!result.checkForConfiguratorUnstableVersions;

    const settings = {
        sessionId: uid.randomUUID(16),
        userId: userId,
        appName: CONFIGURATOR.productName,
        appVersion: CONFIGURATOR.version,
        gitRevision: CONFIGURATOR.gitRevision,
        os: GUI.operating_system,
        checkForDebugVersions: checkForDebugVersions,
        optOut: optOut,
    };

    createAnalytics(settings);
    window.tracking = tracking;

    function logException(exception: Error) {
        tracking?.sendException(exception.stack);
    }

    if (typeof process === "object") {
        process.on("uncaughtException", logException);
    }
}

export function checkSetupAnalytics(callback?: (analyticsService: Analytics | null) => void) {
    if (!tracking) {
        const result: AnalyticsConfig = getConfig([
            "userId",
            "analyticsOptOut",
            "checkForConfiguratorUnstableVersions",
        ]);
        setupAnalytics(result);
    }

    if (callback) {
        callback(tracking);
    }
}

export class Analytics {
    private _settings: AnalyticsSettings;
    private _url: string;
    private _optOut = false;
    readonly EVENT_CATEGORIES: { APPLICATION: string; FLIGHT_CONTROLLER: string; FLASHING: string };

    constructor(settings: AnalyticsSettings) {
        this.setOptOut(settings.optOut);

        this._settings = settings;
        this._url = "https://analytics.betaflight.com";

        this.EVENT_CATEGORIES = {
            APPLICATION: "Application",
            FLIGHT_CONTROLLER: "FlightController",
            FLASHING: "Flashing",
        };

        this.sendSettings();
    }

    send(name: string, properties: unknown) {
        if (this._optOut) {
            return;
        }

        const url = `${this._url}/analytics/${name}`;
        fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                sessionId: this._settings.sessionId,
                userId: this._settings.userId,
                [name]: properties,
            }),
        }).catch(() => {});
    }

    sendSettings() {
        this.send("settings", this._settings);
    }

    sendEvent(category: string, action: string, options?: unknown) {
        this.send("event", { category: category, action: action, options: options });
    }

    sendChangeEvents(category: string, changeList: unknown) {
        this.sendEvent(category, "Change", { changes: changeList });
    }

    sendSaveAndChangeEvents(category: string, changeList: unknown, tabName: string) {
        this.sendEvent(category, "Save", { tab: tabName, changes: changeList });
    }

    sendAppView(viewName: string) {
        this.send("view", viewName);
    }

    sendTiming(category: string, timing: string, value: number) {
        this.send("timing", { category: category, timing: timing, value: value });
    }

    sendException(message: string | undefined) {
        this.send("exception", message);
    }

    setOptOut(optOut: unknown) {
        this._optOut = !!optOut;
    }
}
