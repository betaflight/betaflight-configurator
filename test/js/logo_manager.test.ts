import { beforeEach, describe, expect, it } from "vitest";
import LogoManager from "../../src/js/LogoManager";
import { FONT, SYM } from "../../src/js/utils/osdFont";

function mountLogoMarkup() {
    document.body.innerHTML = `
        <div id="font-logo-preview"></div>
        <div id="font-logo-info-upload-hint"></div>
        <div id="font-logo-info-size" class="valid"></div>
        <div id="font-logo-info-colors" class="invalid"></div>
    `;
}

describe("LogoManager", () => {
    beforeEach(() => {
        mountLogoMarkup();
        SYM.loadSymbols();
        FONT.data = undefined;
        FONT.initData();
    });

    it("caches its elements, sizes the preview to the logo and resets the constraint marks", () => {
        LogoManager.init(FONT, SYM.LOGO);

        const preview = document.querySelector<HTMLElement>("#font-logo-preview");
        expect(LogoManager.elements._preview).toBe(preview);
        expect(preview?.style.width).toBe(`${12 * 24}px`);
        expect(preview?.style.height).toBe(`${18 * 4}px`);
        expect(document.querySelector("#font-logo-info-size")?.classList.contains("valid")).toBe(false);
        expect(document.querySelector("#font-logo-info-colors")?.classList.contains("invalid")).toBe(false);
        expect(document.querySelector<HTMLElement>("#font-logo-info-upload-hint")?.style.display).toBe("none");
    });

    it("toggles the upload hint", () => {
        LogoManager.init(FONT, SYM.LOGO);
        const hint = document.querySelector<HTMLElement>("#font-logo-info-upload-hint");

        LogoManager.showUploadHint();
        expect(hint?.style.display).toBe("");
        LogoManager.hideUploadHint();
        expect(hint?.style.display).toBe("none");
    });

    it("draws one tile per character from the logo start to the end of the font", () => {
        const urls = FONT.requireData().character_image_urls;
        urls[0xa0] = "data:image/svg+xml;utf8,first";
        urls[0xff] = "data:image/svg+xml;utf8,last";
        LogoManager.init(FONT, SYM.LOGO);

        LogoManager.drawPreview();

        const tiles = document.querySelectorAll<HTMLImageElement>("#font-logo-preview img");
        expect(tiles).toHaveLength(256 - 0xa0);
        expect(tiles[0].title).toBe("0xa0");
        expect(tiles[0].getAttribute("src")).toBe("data:image/svg+xml;utf8,first");
        expect(tiles[tiles.length - 1].getAttribute("src")).toBe("data:image/svg+xml;utf8,last");
    });
});
