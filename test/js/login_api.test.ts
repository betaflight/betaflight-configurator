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

vi.mock("../../src/js/ConfigStorage", () => ({ get: vi.fn(() => ({})), set: vi.fn(), remove: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({
    browserSupportsWebAuthn: vi.fn(() => true),
    startAuthentication: vi.fn(),
}));

import { startAuthentication } from "@simplewebauthn/browser";
import { get as getConfig } from "../../src/js/ConfigStorage";
import LoginApi from "../../src/js/LoginApi";

describe("LoginApi stored tokens", () => {
    afterEach(() => {
        vi.mocked(getConfig).mockReset();
        vi.mocked(getConfig).mockImplementation(() => ({}));
        vi.unstubAllGlobals();
    });

    it("loads the user token from its stored record", () => {
        vi.mocked(getConfig).mockImplementation((key: unknown) => (key === "userToken" ? { userToken: "stored" } : {}));
        const api = new LoginApi();

        expect(api.userToken()).toBe(true);
        expect(api._userToken).toBe("stored");
    });

    it("reports no user token when none is stored", () => {
        const api = new LoginApi();

        expect(api.userToken()).toBe(false);
        expect(api._userToken).toBeNull();
    });

    it("uses a stored access token that is still valid without asking the server", async () => {
        const expiry = Date.now() + 60 * 60 * 1000;
        vi.mocked(getConfig).mockImplementation((key: unknown) =>
            key === "accessToken" ? { accessToken: { token: "access", expiry } } : {},
        );
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const api = new LoginApi();

        await expect(api.accessToken()).resolves.toBe(true);
        expect(api._accessToken).toBe("access");
        expect(api._accessExpiryMs).toBe(expiry);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("LoginApi.verifyAssertion", () => {
    const options = { challenge: "c" };

    afterEach(() => {
        vi.mocked(startAuthentication).mockReset();
    });

    it("treats an aborted authentication as a no-op", async () => {
        vi.mocked(startAuthentication).mockRejectedValue(new DOMException("aborted", "AbortError"));

        await expect(new LoginApi().verifyAssertion("key", options)).resolves.toBeUndefined();
    });

    it("rethrows any other failure", async () => {
        const failure = new Error("not allowed");
        vi.mocked(startAuthentication).mockRejectedValue(failure);

        await expect(new LoginApi().verifyAssertion("key", options)).rejects.toBe(failure);
    });
});

describe("LoginApi.signOut", () => {
    let finishRevocation: () => void;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn(
            () =>
                new Promise((resolve) => {
                    finishRevocation = () => resolve({ ok: true });
                }),
        );
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("clears the local session without waiting for the token revocation", async () => {
        const api = new LoginApi();
        api._userToken = "old-token";

        const signingOut = api.signOut();

        // A login made while the revocation is in flight must not be wiped when it lands.
        expect(api._userToken).toBeNull();
        api._userToken = "new-token";
        finishRevocation();
        await signingOut;

        expect(api._userToken).toBe("new-token");
    });

    it("revokes the token the session had, not whatever replaced it", () => {
        const api = new LoginApi();
        api._userToken = "old-token";

        void api.signOut();

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/user/tokens/current"),
            expect.objectContaining({ headers: { Authorization: "Bearer old-token" } }),
        );
    });
});
