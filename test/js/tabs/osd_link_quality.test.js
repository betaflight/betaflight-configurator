import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { OSD } from "../../../src/components/tabs/osd/osd";
import { useFlightControllerStore } from "../../../src/stores/fc";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../../src/js/data_storage";

let fcStore;

describe("OSD Link Quality variants", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
    });

    it("does not expose variants before API 1.49", () => {
        fcStore.config.apiVersion = API_VERSION_1_48;
        OSD.loadDisplayFields();

        expect(OSD.ALL_DISPLAY_FIELDS.LINK_QUALITY.variants).toBeUndefined();
    });

    it("exposes the CRSF display formats from API 1.49", () => {
        fcStore.config.apiVersion = API_VERSION_1_49;
        fcStore.rxConfig.serialrx_provider = fcStore.getSerialRxTypes().indexOf("CRSF");
        OSD.loadDisplayFields();

        expect(OSD.ALL_DISPLAY_FIELDS.LINK_QUALITY.variants).toEqual([
            "osdTextElementLinkQualityVariantRfMode",
            "osdTextElementLinkQualityVariantQualityOnly",
        ]);
    });

    it("does not expose variants for non-CRSF receivers", () => {
        fcStore.config.apiVersion = API_VERSION_1_49;
        fcStore.rxConfig.serialrx_provider = fcStore.getSerialRxTypes().indexOf("SBUS");
        OSD.loadDisplayFields();

        expect(OSD.ALL_DISPLAY_FIELDS.LINK_QUALITY.variants).toBeUndefined();
    });

    it("previews the selected CRSF format", () => {
        fcStore.config.apiVersion = API_VERSION_1_49;
        fcStore.rxConfig.serialrx_provider = fcStore.getSerialRxTypes().indexOf("CRSF");
        OSD.loadDisplayFields();
        OSD.chooseFields();

        const linkQualityIndex = OSD.constants.DISPLAY_FIELDS.findIndex((field) => field.name === "LINK_QUALITY");
        const osdData = { displayItems: [{ name: "LINK_QUALITY", index: linkQualityIndex, variant: 0 }] };
        const displayItem = osdData.displayItems[0];
        OSD.refreshDisplayItemPreview(osdData, displayItem);
        expect(displayItem.preview).toMatch(/2:100$/);

        displayItem.variant = 1;
        OSD.refreshDisplayItemPreview(osdData, displayItem);
        expect(displayItem.preview).toBe("100");
    });
});
