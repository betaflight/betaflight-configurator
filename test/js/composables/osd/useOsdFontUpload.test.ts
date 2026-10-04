import { beforeEach, describe, expect, it, vi } from "vitest";
import MSP from "../../../../src/js/msp";
import { reinitializeConnection } from "../../../../src/js/serial_backend";
import { useOsdFontUpload } from "../../../../src/composables/osd/useOsdFontUpload";

vi.mock("../../../../src/js/msp", () => ({ default: { disconnect_cleanup: vi.fn() } }));
vi.mock("../../../../src/js/serial_backend", () => ({ reinitializeConnection: vi.fn() }));

describe("useOsdFontUpload", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("resets the MSP parser before asking the FC to reboot", () => {
        const order: string[] = [];
        vi.mocked(MSP.disconnect_cleanup).mockImplementation(() => {
            order.push("cleanup");
        });
        vi.mocked(reinitializeConnection).mockImplementation(() => {
            order.push("reboot");
        });

        useOsdFontUpload().rebootAfterFontUpload();

        expect(order).toEqual(["cleanup", "reboot"]);
        expect(MSP.disconnect_cleanup).toHaveBeenCalledOnce();
        expect(reinitializeConnection).toHaveBeenCalledOnce();
    });
});
