import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import VirtualFC from "../../src/js/VirtualFC";
import { useFlightControllerStore } from "../../src/stores/fc";
import { mspHelper } from "../../src/js/msp/MSPHelper";
import { OSD } from "../../src/components/tabs/osd/osd";

describe("the virtual FC reports what a real one does", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        VirtualFC.setVirtualConfig();
    });

    it("seeds OSD timers and parameters with every field the decoder produces", () => {
        OSD.initData();
        OSD.loadDisplayFields();
        OSD.chooseFields();
        VirtualFC.setupVirtualOSD();
        OSD.msp.decodeVirtual();

        expect(OSD.data.timers).toHaveLength(3);
        for (const [index, timer] of OSD.data.timers.entries()) {
            expect(timer).toEqual({ index, src: 0, precision: 0, alarm: 0 });
        }
        expect(OSD.data.parameters?.overlayRadioMode).toBe(0);
    });

    it("gives serial port baud rates as the names MSP decodes them to", () => {
        const known = new Set(mspHelper.BAUD_RATES);

        for (const port of useFlightControllerStore().serialConfig.ports) {
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
        const fcStore = useFlightControllerStore();

        expect(fcStore.motorConfig.motor_kv).toBe(0);
        expect(fcStore.analogData.last_received_timestamp).toBe(0);
        expect(fcStore.sdcard.filesystemLastError).toBe(0);
        expect(fcStore.sensorConfigActive.pitot_hardware).toBe(0);
    });
});
