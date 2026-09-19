import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { type PortConflict, usePortConflicts } from "../../src/composables/ports/usePortConflicts";

vi.mock("../../src/js/localization", () => ({
    __esModule: true,
    // The messages carry named placeholders; echo them so the assertions can see the values land.
    i18n: {
        getMessage: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}(${Object.values(params).join("|")})` : key,
    },
}));

const { isExpertModeEnabled } = vi.hoisted(() => ({ isExpertModeEnabled: vi.fn() }));
vi.mock("../../src/js/utils/isExpertModeEnabled", () => ({ isExpertModeEnabled }));

const { showYesNo } = vi.hoisted(() => ({ showYesNo: vi.fn() }));
vi.mock("../../src/composables/useDialog", () => ({ useDialog: () => ({ showYesNo }) }));

describe("usePortConflicts", () => {
    beforeEach(() => {
        isExpertModeEnabled.mockReturnValue(false);
        showYesNo.mockReset();
        showYesNo.mockResolvedValue(true);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const uart1: PortConflict = { port: "UART1", heldBy: ["GPS"] };
    const uart2: PortConflict = { port: "UART2", heldBy: ["Video transmitter", "OSD"] };

    it("collects the conflicts that are set, unwrapping refs and skipping empty ones", () => {
        const { collectConflicts } = usePortConflicts(() => [ref(uart1), null, ref(null), uart2]);

        expect(collectConflicts()).toEqual([uart1, uart2]);
    });

    it("names a shared busy port only once", () => {
        const { collectConflicts } = usePortConflicts(() => [ref(uart1), ref(uart1)]);

        expect(collectConflicts()).toEqual([uart1]);
    });

    it("saves without asking when there are no conflicts", async () => {
        const { confirmPortConflicts } = usePortConflicts(() => [null, ref(null)]);

        expect(await confirmPortConflicts()).toBe(true);
        expect(showYesNo).not.toHaveBeenCalled();
    });

    it("saves without asking in expert mode, even with a conflict", async () => {
        isExpertModeEnabled.mockReturnValue(true);
        const { confirmPortConflicts } = usePortConflicts(() => [ref(uart1)]);

        expect(await confirmPortConflicts()).toBe(true);
        expect(showYesNo).not.toHaveBeenCalled();
    });

    it("asks for confirmation when a conflict would take a port from another feature", async () => {
        const { confirmPortConflicts } = usePortConflicts(() => [ref(uart1), ref(uart2)]);

        await confirmPortConflicts();

        expect(showYesNo).toHaveBeenCalledTimes(1);
        const [title, text, options] = showYesNo.mock.calls[0];
        expect(title).toBe("portsConflictTitle");
        // Each busy port and the features holding it are named in the body.
        expect(text).toContain("UART1");
        expect(text).toContain("GPS");
        expect(text).toContain("UART2");
        expect(text).toContain("Video transmitter, OSD");
        // Destructive: cancel is the accepted option and "save anyway" is the risky one.
        expect(options).toMatchObject({ destructive: true });
    });

    it("passes the user's choice back to the caller", async () => {
        const { confirmPortConflicts } = usePortConflicts(() => [ref(uart1)]);

        showYesNo.mockResolvedValueOnce(false);
        expect(await confirmPortConflicts()).toBe(false);

        showYesNo.mockResolvedValueOnce(true);
        expect(await confirmPortConflicts()).toBe(true);
    });
});
