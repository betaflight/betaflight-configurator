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

import { describe, expect, it } from "vitest";
import { highlightCliLine } from "../../src/js/CliSyntaxHighlight";

describe("highlightCliLine", () => {
    it("marks a lowercase first word as a command and highlights numbers", () => {
        expect(highlightCliLine("set gyro_lpf1_static_hz = 250")).toBe(
            '<span class="cli-cmd">set</span> gyro_lpf1_static_hz = <span class="cli-num">250</span>',
        );
    });

    it("keeps the indent in front of the command", () => {
        expect(highlightCliLine("  feature GPS")).toBe('  <span class="cli-cmd">feature</span> GPS');
    });

    it("marks a leading word followed by a colon as a label, hyphens included", () => {
        expect(highlightCliLine("SD-CARD: 0x1F")).toBe(
            '<span class="cli-label">SD-CARD:</span> <span class="cli-num">0x1F</span>',
        );
    });

    it("takes every word before a colon into the label, and highlights decimals", () => {
        expect(highlightCliLine("MCU F405 Clock: 168.5")).toBe(
            '<span class="cli-label">MCU F405 Clock:</span> <span class="cli-num">168.5</span>',
        );
    });

    it("highlights a label after a value-first line", () => {
        expect(highlightCliLine("  F405 rev 2, Clock: 168")).toBe(
            '  F405 rev <span class="cli-num">2</span>, <span class="cli-label">Clock:</span> <span class="cli-num">168</span>',
        );
    });

    it("wraps a comment line and still highlights its tokens", () => {
        expect(highlightCliLine("# version 4")).toBe(
            '<span class="cli-comment"># version <span class="cli-num">4</span></span>',
        );
        expect(highlightCliLine("  # master")).toBe('<span class="cli-comment">  # master</span>');
    });

    it("returns a line with no leading word unchanged", () => {
        expect(highlightCliLine("  ... 42")).toBe("  ... 42");
    });

    it("escapes HTML before adding its own markup", () => {
        expect(highlightCliLine("name <img src=x onerror=alert(1)>")).toBe(
            '<span class="cli-cmd">name</span> &lt;img src=x onerror=alert(<span class="cli-num">1</span>)&gt;',
        );
    });
});
