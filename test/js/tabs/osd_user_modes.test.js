import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { OSD } from "../../../src/components/tabs/osd/osd";
import { useFlightControllerStore } from "../../../src/stores/fc";
import { API_VERSION_1_48, API_VERSION_1_49 } from "../../../src/js/data_storage";

// Any field chooseFields asks for resolves to a stub carrying its own name
function stubAllDisplayFields() {
    return new Proxy(
        {},
        {
            get: (_target, name) => ({
                name,
                text: name,
                desc: name,
                defaultPosition: -1,
                draw_order: 0,
                positionable: true,
                preview: name,
            }),
        },
    );
}

function displayFieldNames() {
    OSD.chooseFields();
    return OSD.constants.DISPLAY_FIELDS.map((f) => f.name);
}

let fcStore;

describe("OSD User Modes Field", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        OSD.ALL_DISPLAY_FIELDS = stubAllDisplayFields();
        OSD.constants = OSD.constants || {};
    });

    it("is listed right after BATTERY_PROFILE_NAME for API >= 1.49", () => {
        fcStore.config.apiVersion = API_VERSION_1_49;
        const names = displayFieldNames();

        expect(names.indexOf("USER_MODES")).toEqual(names.indexOf("BATTERY_PROFILE_NAME") + 1);
    });

    it("is listed before the build-gated fields for API >= 1.49", () => {
        fcStore.config.apiVersion = API_VERSION_1_49;
        const names = displayFieldNames();

        expect(names.indexOf("USER_MODES")).toBeLessThan(names.indexOf("PITOT_AIRSPEED"));
    });

    it("is not listed for API < 1.49", () => {
        fcStore.config.apiVersion = API_VERSION_1_48;
        const names = displayFieldNames();

        expect(names).not.toContain("USER_MODES");
    });

    it("has the expected draw_order and preview", () => {
        OSD.data = { video_system: 0 };
        OSD.loadDisplayFields();

        const field = OSD.ALL_DISPLAY_FIELDS.USER_MODES;
        expect(field.name).toEqual("USER_MODES");
        expect(field.draw_order).toEqual(625);
        expect(field.preview).toEqual("LED CAM");
        expect(field.positionable).toEqual(true);
    });
});
