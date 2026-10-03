import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks (must be declared before the module under test is imported) ---

vi.mock("../../src/js/tab_switch", () => ({
    switchTab: vi.fn(),
}));

vi.mock("../../src/js/gui_log", () => ({
    gui_log: vi.fn(),
}));

vi.mock("../../src/js/gui", () => ({
    default: { allowedTabs: ["landing", "firmware_flasher"] },
}));

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: vi.fn((key) => key),
    },
}));

import loginManager from "../../src/js/LoginManager";
import { switchTab } from "../../src/js/tab_switch";
import { gui_log } from "../../src/js/gui_log";

function seedSession() {
    localStorage.setItem("userToken", JSON.stringify({ userToken: "user-token" }));
    localStorage.setItem(
        "accessToken",
        JSON.stringify({ accessToken: { token: "access-token", expiry: Date.now() + 60 * 60 * 1000 } }),
    );
}

describe("LoginManager.deleteAccount", () => {
    let onLogout;
    let unsubscribe;

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        seedSession();
        loginManager._profile = { email: "pilot@example.com" };
        onLogout = vi.fn();
        unsubscribe?.();
        unsubscribe = loginManager.onLogout(onLogout);
    });

    it("clears the session and notifies logout once the account is deleted", async () => {
        const deleteAccount = vi.spyOn(loginManager.getUserApi(), "deleteAccount").mockResolvedValue(undefined);

        await loginManager.deleteAccount();

        expect(deleteAccount).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem("userToken")).toBeNull();
        expect(localStorage.getItem("accessToken")).toBeNull();
        expect(loginManager._loginApi._userToken).toBeNull();
        expect(loginManager._loginApi._accessToken).toBeNull();
        expect(loginManager.getUserProfile()).toBeNull();
        expect(onLogout).toHaveBeenCalledTimes(1);
        expect(switchTab).toHaveBeenCalledWith("landing", { mode: "disconnected" });
        expect(gui_log).toHaveBeenCalledWith("userAccountDeleteSuccess");
    });

    it("rethrows and leaves the session intact when the API fails", async () => {
        vi.spyOn(loginManager.getUserApi(), "deleteAccount").mockRejectedValue(new Error("server error"));

        await expect(loginManager.deleteAccount()).rejects.toThrow("server error");

        expect(localStorage.getItem("userToken")).not.toBeNull();
        expect(localStorage.getItem("accessToken")).not.toBeNull();
        expect(loginManager.getUserProfile()).toEqual({ email: "pilot@example.com" });
        expect(onLogout).not.toHaveBeenCalled();
        expect(switchTab).not.toHaveBeenCalled();
    });
});

describe("LoginManager.showLoginDialog", () => {
    beforeEach(() => {
        loginManager.setDialogOpener(null);
    });

    it("opens the dialog straight away when an opener is registered", () => {
        const opener = vi.fn();
        loginManager.setDialogOpener(opener);

        loginManager.showLoginDialog();

        expect(opener).toHaveBeenCalledTimes(1);
    });

    it("opens the dialog once an opener registers after the request", () => {
        const opener = vi.fn();

        loginManager.showLoginDialog();
        loginManager.setDialogOpener(opener);
        loginManager.setDialogOpener(opener);

        expect(opener).toHaveBeenCalledTimes(1);
    });
});
