import { describe, expect, it } from "vitest";

import { getMixerImageSrc } from "../../src/js/utils/common.js";
import { mixerList } from "../../src/js/model.js";

// FC.MIXER_CONFIG.mixer is 0 until MSP_MIXER_CONFIG arrives, and a tab can render before that
// — "Reopen last tab on connect" mounts the Motors tab straight after the handshake. The
// lookup is 1-based into a 0-based list, so an unset id reaches mixerList[-1].
describe("getMixerImageSrc", () => {
    it("returns the image for a known mixer", () => {
        const quadX = mixerList.findIndex((mixer) => mixer.image === "quad_x") + 1;

        expect(getMixerImageSrc(quadX, false)).toBe("./resources/motor_order/quad_x.svg");
        expect(getMixerImageSrc(quadX, true)).toBe("./resources/motor_order/quad_x_reversed.svg");
    });

    it.each([0, -1, undefined, mixerList.length + 1])("returns nothing for id %s", (id) => {
        expect(getMixerImageSrc(id, false)).toBe("");
    });
});
