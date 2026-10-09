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

vi.mock("../../src/js/ConfigStorage", () => ({ get: () => ({}), set: vi.fn(), remove: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => ({}));

import LoginApi from "../../src/js/LoginApi";

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
