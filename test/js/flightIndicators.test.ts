import { describe, it, expect, beforeEach } from "vitest";
import { flightIndicator } from "../../src/js/flightIndicators";

function host(): HTMLElement {
    document.body.innerHTML = '<div id="instrument"></div>';
    return document.getElementById("instrument")!;
}

const style = (el: HTMLElement, selector: string) => el.querySelector<HTMLElement>(selector)!.style;

describe("flightIndicator", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
    });

    it("builds an attitude indicator from a selector, at its size and starting attitude", () => {
        const el = host();
        flightIndicator("#instrument", "attitude", { size: 90, roll: 10, pitch: 5, img_directory: "img/fi/" });

        expect(style(el, "div.instrument").width).toBe("90px");
        expect(style(el, "div.roll").transform).toBe("rotate(-10deg)");
        expect(style(el, "div.pitch").top).toBe("-3.5%");
        expect(el.querySelector("img")!.getAttribute("src")).toBe("img/fi/fi_box.svg");
    });

    it("limits pitch to 30 degrees either way", () => {
        const el = host();
        const indicator = flightIndicator(el, "attitude");
        indicator.setPitch(35);
        expect(style(el, "div.pitch").top).toBe("-21%");
        indicator.setPitch(80);
        expect(style(el, "div.pitch").top).toBe("-21%");
        indicator.setPitch(-80);
        expect(style(el, "div.pitch").top).toBe("21%");
    });

    it("turns the heading card against the heading", () => {
        const el = host();
        flightIndicator(el, "heading").setHeading(90);
        expect(style(el, "div.heading.box").transform).toBe("rotate(-90deg)");
    });

    it("drives both altimeter needles and the pressure dial", () => {
        const el = host();
        const indicator = flightIndicator(el, "altimeter");
        indicator.setAltitude(1250);
        expect(style(el, "div.needle").transform).toBe("rotate(180deg)");
        expect(style(el, "div.needleSmall").transform).toBe("rotate(45deg)");
        indicator.setPressure(1000);
        expect(style(el, "div.pressure").transform).toBe("rotate(20deg)");
    });

    it("hides and shows the box, and resizes", () => {
        const el = host();
        const indicator = flightIndicator(el, "airspeed", { showBox: false });
        expect(style(el, "img.background").display).toBe("none");
        indicator.showBox();
        expect(style(el, "img.background").display).toBe("");
        indicator.resize(120);
        expect(style(el, "div.instrument").height).toBe("120px");
    });

    it("does nothing for a selector that matches no element", () => {
        const indicator = flightIndicator("#missing", "attitude");
        expect(() => indicator.setRoll(10)).not.toThrow();
        expect(document.body.innerHTML).toBe("");
    });
});
