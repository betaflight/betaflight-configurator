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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const guiLog = vi.hoisted(() => vi.fn());
vi.mock("../../src/js/gui_log", () => ({ gui_log: guiLog }));
vi.mock("../../src/js/localization", () => ({
    i18n: { getMessage: (key: string, params?: unknown) => `${key}:${JSON.stringify(params)}` },
}));

import BuildApi from "../../src/js/BuildApi";
import type LoginApi from "../../src/js/LoginApi";
import CONFIGURATOR from "../../src/js/data_storage";

const fetchMock = vi.fn();

function reply(status: number, body: unknown = null): Response {
    return new Response(body === null ? null : JSON.stringify(body), { status });
}

function sentHeaders(call = 0): Record<string, string> {
    return fetchMock.mock.calls[call][1].headers;
}

function loginApi(token: string | null | Error): LoginApi {
    const getAccessToken = token instanceof Error ? vi.fn().mockRejectedValue(token) : vi.fn().mockResolvedValue(token);
    return { getAccessToken } as unknown as LoginApi;
}

beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    guiLog.mockReset();
    sessionStorage.clear();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("request headers", () => {
    it("sends the app version and, when logged in, the bearer token", async () => {
        fetchMock.mockResolvedValue(reply(200, []));

        await new BuildApi(loginApi("tok")).loadCommits("4.5");

        expect(sentHeaders()).toEqual({ "X-CFG-VER": CONFIGURATOR.version, Authorization: "Bearer tok" });
    });

    it.each([
        ["no token", null],
        ["a failing token lookup", new Error("offline")],
    ])("leaves out the Authorization header on %s", async (_label, token) => {
        fetchMock.mockResolvedValue(reply(200, []));

        await new BuildApi(loginApi(token)).loadCommits("4.5");

        expect(sentHeaders()).toEqual({ "X-CFG-VER": CONFIGURATOR.version });
    });

    it("works without a LoginApi", async () => {
        fetchMock.mockResolvedValue(reply(200, []));

        await new BuildApi(null).loadCommits("4.5");

        expect(sentHeaders()).toEqual({ "X-CFG-VER": CONFIGURATOR.version });
    });
});

describe("fetchJson", () => {
    it("returns the parsed body on a success code", async () => {
        fetchMock.mockResolvedValue(reply(202, [{ sha: "abc", message: "m" }]));

        await expect(new BuildApi(null).loadCommits("4.5")).resolves.toEqual([{ sha: "abc", message: "m" }]);
    });

    it("logs and returns null on any other status", async () => {
        fetchMock.mockResolvedValue(reply(503));

        await expect(new BuildApi(null).loadCommits("4.5")).resolves.toBeNull();
        expect(guiLog).toHaveBeenCalledWith(
            'buildServerFailure:["https://build.betaflight.com/api/releases/4.5/commits","HTTP 503"]',
        );
    });
});

describe("fetchCachedJson", () => {
    const url = "https://build.betaflight.com/api/targets";

    it("caches a response and serves it from the cache within the hour", async () => {
        fetchMock.mockResolvedValue(reply(200, [{ target: "STM32F405" }]));
        const api = new BuildApi(null);

        await api.loadTargets();
        const cached = await api.loadTargets();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(cached).toEqual([{ target: "STM32F405" }]);
    });

    it("fetches again once the cache is an hour old", async () => {
        sessionStorage.setItem(`${url}_Data`, JSON.stringify({ [`${url}_Data`]: [{ target: "OLD" }] }));
        sessionStorage.setItem(
            `${url}_LastUpdate`,
            JSON.stringify({ [`${url}_LastUpdate`]: Date.now() - 3600 * 1000 }),
        );
        fetchMock.mockResolvedValue(reply(200, [{ target: "NEW" }]));

        await expect(new BuildApi(null).loadTargets()).resolves.toEqual([{ target: "NEW" }]);
    });

    it("returns null on a 404 and throws the body on a 500", async () => {
        const api = new BuildApi(null);

        fetchMock.mockResolvedValueOnce(reply(404));
        await expect(api.loadTargetReleases("NOPE")).resolves.toBeNull();

        fetchMock.mockResolvedValueOnce(new Response("server broke", { status: 500 }));
        await expect(api.loadTargetReleases("NOPE")).rejects.toThrow("server broke");
    });
});

describe("loadDeviceFilters", () => {
    it("returns null when the network fails, so the caller keeps its cache", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

        await expect(new BuildApi(null).loadDeviceFilters()).resolves.toBeNull();
    });
});
