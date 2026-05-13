import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createApp, defineComponent, h } from "vue";

// --- Mocks (must be declared before the module under test is imported) ---

vi.mock("../../src/js/LoginManager", () => ({
    default: {
        isUserLoggedIn: vi.fn().mockResolvedValue(false),
        fetchUserProfile: vi.fn().mockResolvedValue(undefined),
        getUserProfile: vi.fn().mockReturnValue(null),
        signOut: vi.fn().mockResolvedValue(undefined),
        loginWithPasskey: vi.fn().mockResolvedValue(undefined),
        createPasskey: vi.fn().mockResolvedValue(undefined),
        requestVerificationCode: vi.fn().mockResolvedValue(undefined),
        loginWithEmailCode: vi.fn().mockResolvedValue(undefined),
        verifyAndCreatePasskey: vi.fn().mockResolvedValue(undefined),
        onLogin: vi.fn().mockReturnValue(() => {}),
        onLogout: vi.fn().mockReturnValue(() => {}),
        setDialogOpener: vi.fn(),
        setWaitingDialogController: vi.fn(),
    },
}));

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: vi.fn((key, args) => {
            if (args) {
                return `${key}(${args.join(",")})`;
            }
            return key;
        }),
    },
}));

import { useUserSession } from "../../src/components/user-session/UserSession.js";
import loginManager from "../../src/js/LoginManager";
import { i18n } from "../../src/js/localization";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function stubWindowHeight(value) {
    Object.defineProperty(globalThis, "innerHeight", { value, configurable: true });
}

// Run a composable inside a minimal Vue app so that onMounted /
// onUnmounted lifecycle hooks fire correctly.
function withSetup(composable) {
    let result;
    const app = createApp(
        defineComponent({
            setup() {
                result = composable();
                return () => h("div");
            },
        }),
    );
    const root = document.createElement("div");
    app.mount(root);
    return { result, app, root };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useUserSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset default mock returns after clearAllMocks
        loginManager.isUserLoggedIn.mockResolvedValue(false);
        loginManager.fetchUserProfile.mockResolvedValue(undefined);
        loginManager.getUserProfile.mockReturnValue(null);
        loginManager.onLogin.mockReturnValue(() => {});
        loginManager.onLogout.mockReturnValue(() => {});
        i18n.getMessage.mockImplementation((key, args) => {
            if (args) {
                return `${key}(${args.join(",")})`;
            }
            return key;
        });
    });

    // -----------------------------------------------------------------------
    // updateMenuPosition — Vue component wrapper path ($el)
    // -----------------------------------------------------------------------
    describe("updateMenuPosition", () => {
        it("uses $el when menuTriggerRef.value is a Vue component wrapper", async () => {
            const { result, app } = withSetup(useUserSession);

            const mockRect = { left: 42, top: 100 };
            const mockEl = {
                getBoundingClientRect: vi.fn().mockReturnValue(mockRect),
            };
            // Simulate a Vue component instance with a $el property
            result.menuTriggerRef.value = { $el: mockEl };

            stubWindowHeight(768);

            result.toggleMenu(); // opens menu and calls updateMenuPosition

            expect(mockEl.getBoundingClientRect).toHaveBeenCalled();
            expect(result.menuStyle.value).toEqual({
                position: "fixed",
                left: "42px",
                bottom: `${768 - 100}px`,
            });

            // Clear the ref before unmount so any residual document listeners
            // from this composable instance see null and short-circuit safely.
            result.menuTriggerRef.value = null;
            app.unmount();
        });

        it("uses menuTriggerRef.value directly when it is a plain DOM element", async () => {
            const { result, app } = withSetup(useUserSession);

            const mockRect = { left: 10, top: 50 };
            const mockEl = {
                getBoundingClientRect: vi.fn().mockReturnValue(mockRect),
            };
            // No $el property — plain DOM element
            result.menuTriggerRef.value = mockEl;

            stubWindowHeight(600);

            result.toggleMenu();

            expect(mockEl.getBoundingClientRect).toHaveBeenCalled();
            expect(result.menuStyle.value).toEqual({
                position: "fixed",
                left: "10px",
                bottom: `${600 - 50}px`,
            });

            result.menuTriggerRef.value = null;
            app.unmount();
        });

        it("is a no-op when menuTriggerRef.value is null", () => {
            const { result, app } = withSetup(useUserSession);

            result.menuTriggerRef.value = null;
            const styleBefore = result.menuStyle.value;

            // Should not throw, and menuStyle should remain unchanged
            expect(() => result.toggleMenu()).not.toThrow();
            expect(result.menuStyle.value).toEqual(styleBefore);

            app.unmount();
        });
    });

    // -----------------------------------------------------------------------
    // handleClickOutside
    // -----------------------------------------------------------------------
    describe("handleClickOutside", () => {
        // Each test gets its own composable instance to avoid stale document
        // listeners from prior tests interfering when events bubble.
        let session;
        let app;
        let triggerEl;
        let popup;

        beforeEach(() => {
            ({ result: session, app } = withSetup(useUserSession));

            triggerEl = document.createElement("div");
            document.body.appendChild(triggerEl);
            session.menuTriggerRef.value = triggerEl;
            session.menuOpen.value = true;

            popup = document.createElement("div");
            popup.id = "user-menu-popup";
            document.body.appendChild(popup);
        });

        afterEach(() => {
            app.unmount();
            triggerEl.remove();
            popup.remove();
        });

        it("closes the menu when click is outside both trigger and popup", () => {
            const outsideEl = document.createElement("div");
            document.body.appendChild(outsideEl);

            outsideEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            expect(session.menuOpen.value).toBe(false);

            outsideEl.remove();
        });

        it("keeps menu open when click is inside the trigger element", () => {
            triggerEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            expect(session.menuOpen.value).toBe(true);
        });

        it("keeps menu open when click is inside the popup element", () => {
            const insidePopup = document.createElement("span");
            popup.appendChild(insidePopup);

            insidePopup.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            expect(session.menuOpen.value).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    // Login mode transitions
    // -----------------------------------------------------------------------
    describe("switchToCodeRequest", () => {
        it("sets loginMode to code-request and clears error and code", () => {
            const { result, app } = withSetup(useUserSession);

            result.loginError.value = "some error";
            result.loginCode.value = "123456";

            result.switchToCodeRequest();

            expect(result.loginMode.value).toBe("code-request");
            expect(result.loginError.value).toBeNull();
            expect(result.loginCode.value).toBe("");

            app.unmount();
        });
    });

    describe("switchToPasskey", () => {
        it("sets loginMode to passkey and clears error and code", () => {
            const { result, app } = withSetup(useUserSession);

            result.loginError.value = "some error";
            result.loginCode.value = "abc";

            result.switchToPasskey();

            expect(result.loginMode.value).toBe("passkey");
            expect(result.loginError.value).toBeNull();
            expect(result.loginCode.value).toBe("");

            app.unmount();
        });
    });

    // -----------------------------------------------------------------------
    // Validation guards
    // -----------------------------------------------------------------------
    describe("handleUsePasskey", () => {
        it("sets loginError and returns without calling loginManager when email is empty", async () => {
            const { result, app } = withSetup(useUserSession);

            result.loginEmail.value = "   "; // whitespace only
            await result.handleUsePasskey();

            expect(result.loginError.value).toBe("userEmailRequired");
            expect(loginManager.loginWithPasskey).not.toHaveBeenCalled();

            app.unmount();
        });
    });

    describe("handleRequestCode", () => {
        it("sets loginError and returns without calling loginManager when email is empty", async () => {
            const { result, app } = withSetup(useUserSession);

            result.loginEmail.value = "";
            await result.handleRequestCode();

            expect(result.loginError.value).toBe("userEmailRequired");
            expect(loginManager.requestVerificationCode).not.toHaveBeenCalled();

            app.unmount();
        });
    });

    // -----------------------------------------------------------------------
    // showWaitingDialog
    // -----------------------------------------------------------------------
    describe("showWaitingDialog", () => {
        it("sets waitingMessage to the provided message and opens the dialog", () => {
            const { result, app } = withSetup(useUserSession);

            result.showWaitingDialog("Please wait…");

            expect(result.waitingMessage.value).toBe("Please wait…");
            expect(result.waitingDialogOpen.value).toBe(true);

            app.unmount();
        });

        it("falls back to the i18n key when null is passed", () => {
            const { result, app } = withSetup(useUserSession);

            result.showWaitingDialog(null);

            expect(i18n.getMessage).toHaveBeenCalledWith("userLoggingIn");
            expect(result.waitingMessage.value).toBe("userLoggingIn");
            expect(result.waitingDialogOpen.value).toBe(true);

            app.unmount();
        });

        it("uses the i18n key as default when called with no argument", () => {
            const { result, app } = withSetup(useUserSession);

            // The default parameter also calls getMessage; capture distinct call count
            const callsBefore = i18n.getMessage.mock.calls.length;
            result.showWaitingDialog();

            const callsAfter = i18n.getMessage.mock.calls.length;
            expect(callsAfter).toBeGreaterThan(callsBefore);
            expect(result.waitingDialogOpen.value).toBe(true);

            app.unmount();
        });
    });

    // -----------------------------------------------------------------------
    // hideWaitingDialog
    // -----------------------------------------------------------------------
    describe("hideWaitingDialog", () => {
        it("sets waitingDialogOpen to false", () => {
            const { result, app } = withSetup(useUserSession);

            result.waitingDialogOpen.value = true;
            result.hideWaitingDialog();

            expect(result.waitingDialogOpen.value).toBe(false);

            app.unmount();
        });
    });
});
