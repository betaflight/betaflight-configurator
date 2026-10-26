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

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import UserApi, { type AccessTokenSource } from "../../src/js/UserApi";

function fakeLoginApi(token: string | null = "access-token"): AccessTokenSource {
    return {
        getAccessToken: vi.fn<AccessTokenSource["getAccessToken"]>().mockResolvedValue(token),
        signOut: vi.fn<AccessTokenSource["signOut"]>(),
    };
}

describe("UserApi.deleteAccount", () => {
    let fetchMock: Mock<typeof fetch>;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it("sends DELETE to /api/user with the bearer token", async () => {
        fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
        const api = new UserApi(fakeLoginApi("abc123"));

        await api.deleteAccount();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith("https://user.betaflight.com/api/user", {
            method: "DELETE",
            headers: { Authorization: "Bearer abc123" },
            signal: expect.any(AbortSignal),
        });
    });

    it("throws the server response text when the request fails", async () => {
        fetchMock.mockResolvedValue(new Response("account locked", { status: 409 }));
        const api = new UserApi(fakeLoginApi());

        await expect(api.deleteAccount()).rejects.toThrow("account locked");
    });

    it("gives up when the server never answers", async () => {
        vi.useFakeTimers();
        fetchMock.mockImplementation(
            (_url, init) =>
                new Promise((_resolve, reject) => {
                    const signal = init?.signal;
                    signal?.addEventListener("abort", () => reject(signal.reason));
                }),
        );
        const api = new UserApi(fakeLoginApi());

        const result = expect(api.deleteAccount()).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(30000);
        await result;
    });

    it("does not call the API without an access token", async () => {
        const api = new UserApi(fakeLoginApi(null));

        await expect(api.deleteAccount()).rejects.toThrow("Unable to obtain access token");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("UserApi.downloadBackupFile", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function serve(headers: Record<string, string>) {
        vi.stubGlobal(
            "fetch",
            vi.fn<typeof fetch>().mockResolvedValue(new Response("set x = 1", { status: 200, headers })),
        );
    }

    it.each([
        ['attachment; filename="craft.txt"', "craft.txt"],
        ["attachment; filename='craft.txt'", "craft.txt"],
        ["attachment; filename= craft.txt ", "craft.txt"],
        ['attachment; filename="it\'s.txt"', "it's.txt"],
    ])("takes the file name from %s", async (disposition, name) => {
        serve({ "Content-Disposition": disposition });

        await expect(new UserApi(fakeLoginApi()).downloadBackupFile(7)).resolves.toEqual({
            name,
            file: "set x = 1",
        });
    });

    it("falls back to backup.txt without a Content-Disposition file name", async () => {
        serve({});

        await expect(new UserApi(fakeLoginApi()).downloadBackupFile(7)).resolves.toEqual({
            name: "backup.txt",
            file: "set x = 1",
        });
    });
});
