import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import loginManager from "../../../src/js/LoginManager";
import { useAuthStore } from "../../../src/stores/auth";

describe("auth store", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("starts logged out and adopts the session state on creation", async () => {
        vi.spyOn(loginManager, "isUserLoggedIn").mockResolvedValue(true);

        const store = useAuthStore();
        expect(store.isLoggedIn).toBe(false);

        await flushPromises();
        expect(store.isLoggedIn).toBe(true);
        store.$dispose();
    });

    it("stays logged out when the first session read fails", async () => {
        const error = new Error("storage unavailable");
        vi.spyOn(loginManager, "isUserLoggedIn").mockRejectedValue(error);
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        const store = useAuthStore();
        await flushPromises();

        expect(store.isLoggedIn).toBe(false);
        expect(consoleError).toHaveBeenCalledWith("Failed to read the login state", error);
        store.$dispose();
    });

    it("re-reads the session state on refresh", async () => {
        const isUserLoggedIn = vi.spyOn(loginManager, "isUserLoggedIn").mockResolvedValue(true);
        const store = useAuthStore();
        await flushPromises();

        isUserLoggedIn.mockResolvedValue(false);
        await store.refresh();

        expect(store.isLoggedIn).toBe(false);
        expect(isUserLoggedIn).toHaveBeenCalledTimes(2);
        store.$dispose();
    });

    it("follows login and logout notifications", async () => {
        vi.spyOn(loginManager, "isUserLoggedIn").mockResolvedValue(false);
        const store = useAuthStore();
        await flushPromises();

        loginManager.notifyLoginCallbacks();
        expect(store.isLoggedIn).toBe(true);

        loginManager.notifyLogoutCallbacks();
        expect(store.isLoggedIn).toBe(false);
        store.$dispose();
    });

    it("unsubscribes from the login manager when disposed", async () => {
        vi.spyOn(loginManager, "isUserLoggedIn").mockResolvedValue(false);
        const loginCallbacks = loginManager._onLoginCallbacks.length;
        const logoutCallbacks = loginManager._onLogoutCallbacks.length;

        const store = useAuthStore();
        await flushPromises();
        expect(loginManager._onLoginCallbacks).toHaveLength(loginCallbacks + 1);
        expect(loginManager._onLogoutCallbacks).toHaveLength(logoutCallbacks + 1);

        store.$dispose();
        expect(loginManager._onLoginCallbacks).toHaveLength(loginCallbacks);
        expect(loginManager._onLogoutCallbacks).toHaveLength(logoutCallbacks);
    });
});
