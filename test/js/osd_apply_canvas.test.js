import { beforeEach, describe, expect, it } from "vitest";
import { OSD } from "../../src/components/tabs/osd/osd";

const VIDEO_SYSTEM = Object.fromEntries(OSD.constants.VIDEO_TYPES.map((type, index) => [type, index]));

describe("OSD.applyCanvas", () => {
    beforeEach(() => {
        OSD.initData();
        OSD.data.state = {};
    });

    it("does nothing when no canvas size was reported", () => {
        OSD.data.video_system = VIDEO_SYSTEM.HD;

        OSD.applyCanvas(OSD.data);

        expect(OSD.data.VIDEO_COLS.HD).toBe(53);
        expect(OSD.data.VIDEO_ROWS.HD).toBe(20);
        expect(OSD.data.state.requiresFbSmallFont).toBe(false);
    });

    it("sizes the HD grid for non-FB_OSD devices, whatever the video system", () => {
        OSD.data.canvas = { cols: 60, rows: 22 };
        OSD.data.video_system = VIDEO_SYSTEM.PAL;

        OSD.applyCanvas(OSD.data);

        expect(OSD.data.VIDEO_COLS.HD).toBe(60);
        expect(OSD.data.VIDEO_ROWS.HD).toBe(22);
        expect(OSD.data.VIDEO_COLS.PAL).toBe(30);
        expect(OSD.data.VIDEO_ROWS.PAL).toBe(16);
        expect(OSD.data.state.requiresFbSmallFont).toBe(false);
    });

    it("sizes the selected SD grid for FB_OSD devices", () => {
        OSD.data.canvas = { cols: 46, rows: 21 };
        OSD.data.video_system = VIDEO_SYSTEM.NTSC;
        OSD.data.state.haveFbOsdConfigured = true;

        OSD.applyCanvas(OSD.data);

        expect(OSD.data.VIDEO_COLS.NTSC).toBe(46);
        expect(OSD.data.VIDEO_ROWS.NTSC).toBe(21);
        expect(OSD.data.VIDEO_COLS.PAL).toBe(30);
        expect(OSD.data.VIDEO_COLS.HD).toBe(53);
        expect(OSD.data.state.requiresFbSmallFont).toBe(true);
    });

    it("treats AUTO as PAL for FB_OSD devices", () => {
        OSD.data.canvas = { cols: 46, rows: 24 };
        OSD.data.video_system = VIDEO_SYSTEM.AUTO;
        OSD.data.state.haveFbOsdConfigured = true;

        OSD.applyCanvas(OSD.data);

        expect(OSD.data.VIDEO_COLS.PAL).toBe(46);
        expect(OSD.data.VIDEO_ROWS.PAL).toBe(24);
        expect(OSD.data.VIDEO_COLS.NTSC).toBe(30);
        expect(OSD.data.state.requiresFbSmallFont).toBe(true);
    });

    it("restores the built-in grid sizes left over from a previous connection", () => {
        // A small font FB_OSD board wrote its canvas into the PAL slot; the next board reports no canvas.
        OSD.data.VIDEO_COLS.PAL = 46;
        OSD.data.VIDEO_ROWS.PAL = 24;
        OSD.data.canvas = null;

        OSD.applyCanvas(OSD.data);

        expect(OSD.data.VIDEO_COLS.PAL).toBe(30);
        expect(OSD.data.VIDEO_ROWS.PAL).toBe(16);
    });

    it("does not keep a previous FB_OSD canvas when an HD device reports its own", () => {
        OSD.data.VIDEO_COLS.PAL = 46;
        OSD.data.canvas = { cols: 60, rows: 22 };
        OSD.data.video_system = VIDEO_SYSTEM.HD;

        OSD.applyCanvas(OSD.data);

        expect(OSD.data.VIDEO_COLS.PAL).toBe(30);
        expect(OSD.data.VIDEO_COLS.HD).toBe(60);
    });

    it("canvas cols 30 for FB_OSD device implies not small font", () => {
        OSD.data.canvas = { cols: 30, rows: 16 };
        OSD.data.video_system = VIDEO_SYSTEM.AUTO;
        OSD.data.state.haveFbOsdConfigured = true;

        OSD.applyCanvas(OSD.data);

        expect(OSD.data.VIDEO_COLS.PAL).toBe(30);
        expect(OSD.data.VIDEO_ROWS.PAL).toBe(16);
        expect(OSD.data.VIDEO_COLS.NTSC).toBe(30);
        expect(OSD.data.state.requiresFbSmallFont).toBe(false);
    });
});
