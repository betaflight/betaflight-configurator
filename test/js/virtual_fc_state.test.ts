import { beforeEach, describe, expect, it } from "vitest";
import VirtualFC from "../../src/js/VirtualFC";
import FC from "../../src/js/fc";
import { mspHelper } from "../../src/js/msp/MSPHelper";
import { OSD } from "../../src/components/tabs/osd/osd";

// osd.js builds OSD.data inside functions, so TypeScript sees none of it.
const osd = OSD as unknown as {
    initData(): void;
    loadDisplayFields(): void;
    chooseFields(): void;
    msp: { decodeVirtual(): void };
    data: { timers: Record<string, unknown>[]; parameters: Record<string, unknown> };
};

describe("the virtual FC reports what a real one does", () => {
    beforeEach(() => {
        VirtualFC.setVirtualConfig();
    });

    it("seeds OSD timers and parameters with every field the decoder produces", () => {
        osd.initData();
        osd.loadDisplayFields();
        osd.chooseFields();
        VirtualFC.setupVirtualOSD();
        osd.msp.decodeVirtual();

        expect(osd.data.timers).toHaveLength(3);
        for (const [index, timer] of osd.data.timers.entries()) {
            expect(timer).toEqual({ index, src: 0, precision: 0, alarm: 0 });
        }
        expect(osd.data.parameters.overlayRadioMode).toBe(0);
    });

    it("gives serial port baud rates as the names MSP decodes them to", () => {
        const known = new Set(mspHelper.BAUD_RATES);

        for (const port of FC.SERIAL_CONFIG.ports) {
            for (const baud of [
                port.msp_baudrate,
                port.gps_baudrate,
                port.telemetry_baudrate,
                port.blackbox_baudrate,
            ]) {
                expect(known.has(baud)).toBe(true);
            }
        }
    });

    it("keeps the fields it does not override", () => {
        expect(FC.MOTOR_CONFIG.motor_kv).toBe(0);
        expect(FC.ANALOG.last_received_timestamp).toBe(0);
        expect(FC.SDCARD.filesystemLastError).toBe(0);
        expect(FC.SENSOR_CONFIG_ACTIVE.pitot_hardware).toBe(0);
    });
});
