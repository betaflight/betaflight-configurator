/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

const autoComplete = vi.hoisted(() => ({
    enabled: true,
    building: false,
    cache: {
        commands: ["diff", "dump", "feature", "get", "resource", "set", "status"],
        resources: ["LED_STRIP", "MOTOR"],
        resourcesCount: { MOTOR: 4, LED_STRIP: 1 } as Record<string, number>,
        settings: ["dshot_bidir", "gyro_lpf1_static_hz", "gyro_lpf2_static_hz", "motor_pwm_protocol", "osd_tag"],
        settingsAcceptedValues: {
            gyro_lpf1_static_hz: "Allowed range: 0 - 1000",
            motor_pwm_protocol: ["DSHOT150", "DSHOT300", "DSHOT600", "OFF"],
            osd_tag: ["A<B", "PLAIN"],
        } as Record<string, string[] | string>,
        feature: ["GPS", "LED_STRIP", "TELEMETRY"],
        beeper: ["ALL", "RX_LOST"],
        mixers: ["list", "QUADX", "TRI"],
    },
}));

vi.mock("../../src/js/CliAutoComplete", () => ({
    default: {
        isEnabled: () => autoComplete.enabled,
        isBuilding: () => autoComplete.building,
        get cache() {
            return autoComplete.cache;
        },
    },
}));
vi.mock("../../src/js/fc", () => ({ default: { CONFIG: { flightControllerVersion: "4.5.0" } } }));

import { useCliAutocomplete, type CliAutocomplete } from "../../src/composables/useCliAutocomplete";

describe("useCliAutocomplete", () => {
    let ac: CliAutocomplete;
    let input: string;

    function texts() {
        return ac.items.value.map((item) => item.text);
    }

    /** Type `text` and let the dropdown react, as the textarea's input handler does. */
    function type(text: string) {
        input = text;
        ac.update(text);
    }

    beforeEach(() => {
        autoComplete.enabled = true;
        autoComplete.building = false;
        input = "";
        ac = useCliAutocomplete();
        ac.connect(
            () => input,
            (value) => {
                input = value;
            },
        );
    });

    describe("commands", () => {
        it("offers commands by prefix on Tab, with the typed part in bold", () => {
            type("d");
            expect(ac.visible.value).toBe(false);

            ac.openForced("d");

            expect(texts()).toEqual(["diff", "dump"]);
            expect(ac.items.value[0].html).toBe("<b>d</b>iff");
            expect(ac.visible.value).toBe(true);
            expect(ac.sendOnEnter.value).toBe(false);
        });

        it("completes the command and a trailing space on select", () => {
            input = "  sta";
            ac.openForced(input);

            expect(input).toBe("  status ");
            expect(ac.visible.value).toBe(false);
        });

        it("stays closed on an empty line until Tab forces it open", () => {
            type("");
            expect(ac.visible.value).toBe(false);

            ac.openForced("");
            expect(texts()).toEqual(autoComplete.cache.commands);
        });
    });

    describe("settings", () => {
        it("needs three characters before suggesting a setting to set", () => {
            // Too short for names; the line still reads as "set <name>", so "=" is offered.
            type("set gy");
            expect(texts()).toEqual(["="]);

            type("set gyr");
            expect(texts()).toEqual(["gyro_lpf1_static_hz", "gyro_lpf2_static_hz"]);
        });

        it("matches anywhere in a setting name, highlighting the match", () => {
            type("set lpf2");

            expect(texts()).toEqual(["gyro_lpf2_static_hz"]);
            expect(ac.items.value[0].html).toBe("gyro_<b>lpf2</b>_static_hz");
        });

        it("for get, offers the typed term itself first, so a partial name can be sent as-is", () => {
            type("get gyro");

            expect(texts()).toEqual(["gyro", "gyro_lpf1_static_hz", "gyro_lpf2_static_hz"]);
            expect(ac.sendOnEnter.value).toBe(true);
        });

        it("suggests = after a complete setting name, then its values once = is picked", async () => {
            type("set motor_pwm_protocol ");
            expect(texts()).toEqual(["="]);

            ac.selectItem(0);
            expect(input).toBe("set motor_pwm_protocol = ");

            await nextTick();
            expect(texts()).toEqual(["DSHOT150", "DSHOT300", "DSHOT600", "OFF"]);
        });

        it("filters a lookup setting's values and fills in the pick, ready to send", () => {
            type("set motor_pwm_protocol = dshot6");

            expect(texts()).toEqual(["DSHOT600"]);
            expect(ac.sendOnEnter.value).toBe(true);

            ac.selectItem(0);
            expect(input).toBe("set motor_pwm_protocol = DSHOT600");
        });

        it("shows a numeric setting's range as a hint, keeping the typed value when it is picked", () => {
            type("set gyro_lpf1_static_hz = 250");

            expect(texts()).toEqual(["Allowed range: 0 - 1000"]);
            ac.selectItem(0);
            expect(input).toBe("set gyro_lpf1_static_hz = 250");
        });

        it("escapes values before they reach the dropdown's HTML", () => {
            type("set osd_tag = A");

            expect(ac.items.value.find((item) => item.text === "A<B")?.html).toBe("<b>A</b>&lt;B");
        });
    });

    describe("resources", () => {
        it("offers show first on 4.0+ firmware, then the resource names", () => {
            type("resource M");

            expect(texts()).toEqual(["MOTOR"]);
            ac.openForced("resource ");
            expect(texts()).toEqual(["show", "LED_STRIP", "MOTOR"]);
        });

        it("hints the index range of a resource with several instances", () => {
            type("resource MOTOR ");

            expect(texts()).toEqual(["<1-4>"]);
        });

        it("goes straight to the pin for a resource with a single instance", () => {
            type("resource LED_STRIP ");

            expect(texts()).toEqual(["<pin>", "none"]);
        });

        it("asks for the pin once an index is given, and completes none", () => {
            type("resource MOTOR 2 n");

            expect(texts()).toEqual(["none"]);
            ac.selectItem(0);
            expect(input).toBe("resource MOTOR 2 none ");
            expect(ac.sendOnEnter.value).toBe(true);
        });

        it("leaves the input alone when the pin placeholder is picked", () => {
            type("resource MOTOR 2 ");
            ac.selectItem(0);

            expect(input).toBe("resource MOTOR 2 ");
            expect(ac.visible.value).toBe(false);
        });
    });

    describe("features", () => {
        it("offers - to disable, then the feature list again", async () => {
            type("feature ");
            ac.openForced("feature ");
            expect(texts()).toEqual(["-", "list", "GPS", "LED_STRIP", "TELEMETRY"]);

            ac.selectItem(0);
            expect(input).toBe("feature -");

            await nextTick();
            expect(texts()).toEqual(["GPS", "LED_STRIP", "TELEMETRY"]);
        });
    });

    describe("dropdown", () => {
        it("auto-picks the only suggestion when Tab forces it open", () => {
            input = "diff a";
            ac.openForced(input);

            expect(input).toBe("diff all ");
            expect(ac.visible.value).toBe(false);
        });

        it("stays closed while the caret is inside a word", () => {
            input = "dump";
            ac.update(input, 2);

            expect(ac.visible.value).toBe(false);
        });

        it("stays closed while the cache is building or autocomplete is off", () => {
            autoComplete.building = true;
            ac.openForced("d");
            expect(ac.visible.value).toBe(false);

            autoComplete.building = false;
            autoComplete.enabled = false;
            ac.openForced("d");
            expect(ac.visible.value).toBe(false);
        });

        it("keeps the highlighted item within the list", () => {
            ac.openForced("d");

            ac.navigateUp();
            expect(ac.activeIndex.value).toBe(0);
            ac.navigateDown();
            ac.navigateDown();
            expect(ac.activeIndex.value).toBe(1);
        });

        it("ignores a select once the list has closed", () => {
            type("set gyr");
            ac.hide();

            ac.selectItem(0);

            expect(input).toBe("set gyr");
        });
    });
});
