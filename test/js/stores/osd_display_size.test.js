import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { OSD } from "../../../src/components/tabs/osd/osd";
import { useOsdStore } from "../../../src/stores/osd.js";

// VIDEO_TYPES = ["AUTO", "PAL", "NTSC", "HD"] (see osd_constants.js)
const VIDEO_SYSTEM = { AUTO: 0, PAL: 1, NTSC: 2, HD: 3 };

describe("osd store updateDisplaySize", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        // Reset the legacy OSD.data to its built-in defaults (PAL/NTSC/HD).
        OSD.initData();
    });

    it("uses PAL dimensions", () => {
        const store = useOsdStore();
        store.videoSystem = VIDEO_SYSTEM.PAL;

        store.updateDisplaySize();

        expect(store.displaySize.x).toBe(30);
        expect(store.displaySize.y).toBe(16);
        expect(store.displaySize.total).toBe(480);
    });

    it("uses NTSC dimensions", () => {
        const store = useOsdStore();
        store.videoSystem = VIDEO_SYSTEM.NTSC;

        store.updateDisplaySize();

        expect(store.displaySize.x).toBe(30);
        expect(store.displaySize.y).toBe(13);
        expect(store.displaySize.total).toBe(390);
    });

    it("treats AUTO as PAL", () => {
        const store = useOsdStore();
        store.videoSystem = VIDEO_SYSTEM.AUTO;

        store.updateDisplaySize();

        expect(store.displaySize.x).toBe(30);
        expect(store.displaySize.y).toBe(16);
        expect(store.displaySize.total).toBe(480);
    });

    it("uses the built-in HD defaults when no canvas size was reported", () => {
        const store = useOsdStore();
        store.videoSystem = VIDEO_SYSTEM.HD;

        store.updateDisplaySize();

        expect(store.displaySize.x).toBe(53);
        expect(store.displaySize.y).toBe(20);
        expect(store.displaySize.total).toBe(1060);
    });

    it("honours the HD canvas size reported by the firmware via MSP_OSD_CANVAS", () => {
        // Simulate the MSP_OSD_CANVAS handler (see MSPHelper.js) writing a custom
        // canvas size, e.g. a DJI WTFOS / MSP-OSD device advertising 60 x 22.
        OSD.data.VIDEO_COLS.HD = 60;
        OSD.data.VIDEO_ROWS.HD = 22;

        const store = useOsdStore();
        store.videoSystem = VIDEO_SYSTEM.HD;

        store.updateDisplaySize();

        expect(store.displaySize.x).toBe(60);
        expect(store.displaySize.y).toBe(22);
        expect(store.displaySize.total).toBe(1320);
    });
});
