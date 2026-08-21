import { beforeEach, describe, expect, it } from "vitest";
import { OSD } from "../../../src/components/tabs/osd/osd";
import FC from "../../../src/js/fc";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../../src/js/data_storage";

describe("OSD Link Quality variants", () => {
    beforeEach(() => {
        FC.resetState();
    });

    it("does not expose variants before API 1.49", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_48;
        OSD.loadDisplayFields();

        expect(OSD.ALL_DISPLAY_FIELDS.LINK_QUALITY.variants).toBeUndefined();
    });

    it("exposes the CRSF display formats from API 1.49", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_49;
        FC.RX_CONFIG.serialrx_provider = FC.getSerialRxTypes().indexOf("CRSF");
        OSD.loadDisplayFields();

        expect(OSD.ALL_DISPLAY_FIELDS.LINK_QUALITY.variants).toEqual([
            "osdTextElementLinkQualityVariantRfMode",
            "osdTextElementLinkQualityVariantQualityOnly",
        ]);
    });

    it("does not expose variants for non-CRSF receivers", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_49;
        FC.RX_CONFIG.serialrx_provider = FC.getSerialRxTypes().indexOf("SBUS");
        OSD.loadDisplayFields();

        expect(OSD.ALL_DISPLAY_FIELDS.LINK_QUALITY.variants).toBeUndefined();
    });

    it("previews the selected CRSF format", () => {
        FC.CONFIG.apiVersion = API_VERSION_1_49;
        FC.RX_CONFIG.serialrx_provider = FC.getSerialRxTypes().indexOf("CRSF");
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
