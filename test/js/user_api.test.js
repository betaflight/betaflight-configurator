import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import UserApi from "../../src/js/UserApi";

function fakeLoginApi(token = "access-token") {
    return {
        getAccessToken: vi.fn().mockResolvedValue(token),
        signOut: vi.fn(),
    };
}

describe("UserApi.deleteAccount", () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
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
            (_url, { signal }) =>
                new Promise((_resolve, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason));
                }),
        );
        const api = new UserApi(fakeLoginApi());

        const result = expect(api.deleteAccount()).rejects.toThrow();
        await vi.advanceTimersByTimeAsync(30000);
        await result;
        vi.useRealTimers();
    });

    it("does not call the API without an access token", async () => {
        const api = new UserApi(fakeLoginApi(null));

        await expect(api.deleteAccount()).rejects.toThrow("Unable to obtain access token");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
