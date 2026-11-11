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
import { bracketHost, unbracketHost } from "../../../src/js/utils/host";

describe("unbracketHost", () => {
    it("strips the brackets from an IPv6 host", () => {
        expect(unbracketHost("[fe80::1]")).toBe("fe80::1");
    });

    it("leaves a host without brackets alone", () => {
        expect(unbracketHost("fe80::1")).toBe("fe80::1");
        expect(unbracketHost("192.168.4.1")).toBe("192.168.4.1");
    });
});

describe("bracketHost", () => {
    it("brackets an IPv6 host", () => {
        expect(bracketHost("fe80::1")).toBe("[fe80::1]");
    });

    it("leaves a host name or an IPv4 address alone", () => {
        expect(bracketHost("elrs_tx.local")).toBe("elrs_tx.local");
        expect(bracketHost("192.168.4.1")).toBe("192.168.4.1");
    });

    it("round-trips with unbracketHost", () => {
        expect(unbracketHost(bracketHost("fe80::1"))).toBe("fe80::1");
    });
});
