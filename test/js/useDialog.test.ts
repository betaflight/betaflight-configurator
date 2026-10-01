import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useDialog } from "../../src/composables/useDialog";
import { useDialogStore } from "../../src/stores/dialog";

type Listener = (...args: unknown[]) => void;

describe("useDialog", () => {
    let dialog: ReturnType<typeof useDialog>;
    let store: ReturnType<typeof useDialogStore>;

    // What GlobalDialogs.vue does when the dialog component emits `event`.
    function emit(event: string, ...args: unknown[]) {
        const listener = store.activeDialog?.listeners[event] as Listener | undefined;
        if (!listener) {
            throw new Error(`no "${event}" listener on ${store.activeDialog?.type ?? "a closed dialog"}`);
        }
        listener(...args);
    }

    beforeEach(() => {
        setActivePinia(createPinia());
        store = useDialogStore();
        dialog = useDialog();
    });

    describe("openYesNo", () => {
        it("opens YesNoDialog with default button labels", () => {
            dialog.openYesNo("Title", "Body");

            expect(store.activeDialog?.type).toBe("YesNoDialog");
            expect(store.activeDialog?.props).toEqual({ title: "Title", text: "Body", yesText: "Yes", noText: "No" });
        });

        it("passes custom labels and destructive through", () => {
            dialog.openYesNo("Title", "Body", null, null, { yesText: "Save", noText: "Back", destructive: true });

            expect(store.activeDialog?.props).toMatchObject({ yesText: "Save", noText: "Back", destructive: true });
        });

        it("closes, then runs the matching handler", () => {
            const onYes = vi.fn(() => expect(store.activeDialog).toBeNull());
            const onNo = vi.fn();

            dialog.openYesNo("Title", "Body", onYes, onNo);
            emit("yes");

            expect(onYes).toHaveBeenCalledOnce();
            expect(onNo).not.toHaveBeenCalled();

            dialog.openYesNo("Title", "Body", onYes, onNo);
            emit("no");

            expect(onNo).toHaveBeenCalledOnce();
            expect(store.activeDialog).toBeNull();
        });

        it("keeps a dialog the handler opens, since the close happens first", () => {
            dialog.openYesNo("Restore?", "Body", () => dialog.openWait("Restoring", null));

            emit("yes");

            expect(store.activeDialog?.type).toBe("WaitDialog");
        });

        it("just closes when no handler was given", () => {
            dialog.openYesNo("Title", "Body", null, undefined);

            expect(() => emit("no")).not.toThrow();
            expect(store.activeDialog).toBeNull();
        });
    });

    describe("openInfo", () => {
        it("opens InformationDialog labelled OK by default", () => {
            dialog.openInfo("Title", "Body");

            expect(store.activeDialog?.type).toBe("InformationDialog");
            expect(store.activeDialog?.props).toEqual({ title: "Title", text: "Body", confirmText: "OK" });
        });

        it("uses the confirm label from the options, with no handler", () => {
            dialog.openInfo("Title", "Body", null, { confirmText: "Got it" });

            expect(store.activeDialog?.props.confirmText).toBe("Got it");
            expect(() => emit("confirm")).not.toThrow();
            expect(store.activeDialog).toBeNull();
        });

        it("runs the handler on confirm", () => {
            const onConfirm = vi.fn();
            dialog.openInfo("Title", "Body", onConfirm);

            emit("confirm");

            expect(onConfirm).toHaveBeenCalledOnce();
        });
    });

    describe("openWait", () => {
        it("hides the cancel button when there is nothing to cancel", () => {
            dialog.openWait("Working", null);

            expect(store.activeDialog?.type).toBe("WaitDialog");
            expect(store.activeDialog?.props).toEqual({ title: "Working", showCancel: false, cancelText: "Cancel" });
        });

        it("shows it and runs the handler when there is", () => {
            const onCancel = vi.fn();
            dialog.openWait("Working", onCancel, { cancelText: "Stop" });

            expect(store.activeDialog?.props).toMatchObject({ showCancel: true, cancelText: "Stop" });
            emit("cancel");
            expect(onCancel).toHaveBeenCalledOnce();
            expect(store.activeDialog).toBeNull();
        });
    });

    describe("openProfileSelection", () => {
        it("hands the picked value to onConfirm", () => {
            const onConfirm = vi.fn();
            const options = [{ label: "Profile 2", value: 1 }];
            dialog.openProfileSelection("Pick", "Which one?", options, onConfirm, null);

            expect(store.activeDialog?.type).toBe("ProfileSelectionDialog");
            expect(store.activeDialog?.props).toEqual({
                title: "Pick",
                message: "Which one?",
                options,
                confirmText: "OK",
                cancelText: "Cancel",
            });
            emit("confirm", 1);
            expect(onConfirm).toHaveBeenCalledWith(1);
        });

        it("runs onCancel on cancel", () => {
            const onCancel = vi.fn();
            dialog.openProfileSelection("Pick", "Which one?", [], null, onCancel, "Go", "Back");

            expect(store.activeDialog?.props).toMatchObject({ confirmText: "Go", cancelText: "Back" });
            emit("cancel");
            expect(onCancel).toHaveBeenCalledOnce();
        });
    });

    describe("openCopyProfile", () => {
        it("passes both option lists and the label overrides to CopyProfileDialog", () => {
            const profiles = [{ label: "Profile 2", value: 1 }];
            dialog.openCopyProfile("Copy", "Note", profiles, [], null, null, { confirmText: "Copy now" });

            expect(store.activeDialog?.type).toBe("CopyProfileDialog");
            expect(store.activeDialog?.props).toEqual({
                title: "Copy",
                note: "Note",
                profileOptions: profiles,
                rateOptions: [],
                confirmText: "Copy now",
            });
        });

        it("hands the selection to onConfirm", () => {
            const onConfirm = vi.fn();
            const onCancel = vi.fn();
            dialog.openCopyProfile("Copy", "Note", [], [{ label: "Rate 3", value: 2 }], onConfirm, onCancel);

            emit("confirm", { profile: null, rateProfile: 2 });

            expect(onConfirm).toHaveBeenCalledWith({ profile: null, rateProfile: 2 });
            expect(onCancel).not.toHaveBeenCalled();
        });
    });

    describe("promise helpers", () => {
        it("showYesNo resolves true on yes and false on no", async () => {
            const yes = dialog.showYesNo("Title", "Body", { yesText: "Delete" });
            expect(store.activeDialog?.props.yesText).toBe("Delete");
            emit("yes");
            await expect(yes).resolves.toBe(true);

            const no = dialog.showYesNo("Title", "Body");
            emit("no");
            await expect(no).resolves.toBe(false);
        });

        it("showInfo resolves once confirmed", async () => {
            let settled = false;
            const info = dialog.showInfo("Title", "Body", { confirmText: "Close" }).then(() => {
                settled = true;
            });

            await Promise.resolve();
            expect(settled).toBe(false);

            emit("confirm");
            await info;
            expect(settled).toBe(true);
        });

        it("showWait returns a handle that closes the dialog", () => {
            const handle = dialog.showWait("Loading", null);
            expect(store.activeDialog?.type).toBe("WaitDialog");

            handle.close();

            expect(store.activeDialog).toBeNull();
        });
    });

    describe("open / close", () => {
        it("opens any dialog with its props and listeners as given", () => {
            const apply = vi.fn((_alignment: { roll: number }) => {});
            dialog.open("BoardAlignmentWizardDialog", { currentAlignment: { roll: 0 } }, { apply });

            expect(store.activeDialog?.type).toBe("BoardAlignmentWizardDialog");
            expect(store.activeDialog?.props).toEqual({ currentAlignment: { roll: 0 } });

            emit("apply", { roll: 90 });
            expect(apply).toHaveBeenCalledWith({ roll: 90 });
            // A bare listener does not close; that is the caller's job.
            expect(store.activeDialog).not.toBeNull();

            dialog.close();
            expect(store.activeDialog).toBeNull();
        });
    });
});
