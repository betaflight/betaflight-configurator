import { describe, expect, it } from "vitest";

import { parseConnectDeeplink } from "../../src/js/utils/connectDeeplink";

describe("parseConnectDeeplink", () => {
    it("accepts a wss:// target", () => {
        expect(parseConnectDeeplink("?connect=wss://quad.local:5761")).toBe("wss://quad.local:5761");
    });

    it("accepts ws:// and tcp:// targets", () => {
        expect(parseConnectDeeplink("?connect=ws://127.0.0.1:6761")).toBe("ws://127.0.0.1:6761");
        expect(parseConnectDeeplink("?connect=tcp://192.168.4.1:5761")).toBe("tcp://192.168.4.1:5761");
    });

    it("trims surrounding whitespace", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("  wss://host:5761  ")}`)).toBe("wss://host:5761");
    });

    it("preserves a path on the target", () => {
        expect(parseConnectDeeplink("?connect=wss://host:5761/mavlink")).toBe("wss://host:5761/mavlink");
    });

    it("ignores other query parameters", () => {
        expect(parseConnectDeeplink("?foo=bar&connect=wss://host:5761&baz=1")).toBe("wss://host:5761");
    });

    it("returns null when there is no connect parameter", () => {
        expect(parseConnectDeeplink("")).toBeNull();
        expect(parseConnectDeeplink("?other=1")).toBeNull();
    });

    it("rejects a serial device path — it names hardware on one machine only", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("/dev/ttyUSB0")}`)).toBeNull();
        expect(parseConnectDeeplink("?connect=COM3")).toBeNull();
    });

    it("rejects a bare host with no scheme", () => {
        expect(parseConnectDeeplink("?connect=192.168.4.1:5761")).toBeNull();
    });

    it("rejects disallowed schemes", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("http://host:5761")}`)).toBeNull();
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("javascript:alert(1)")}`)).toBeNull();
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("file:///etc/passwd")}`)).toBeNull();
    });

    it("rejects a scheme with no host", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("wss://")}`)).toBeNull();
    });

    it("rejects a target carrying a fragment — the parser drops it before connectFromDeeplink forwards the target", () => {
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("wss://host:5761#frag")}`)).toBeNull();
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent("wss://host:5761/mavlink#frag")}`)).toBeNull();
    });

    it("rejects an over-long value", () => {
        const target = `wss://${"a".repeat(600)}.local:5761`;
        expect(parseConnectDeeplink(`?connect=${encodeURIComponent(target)}`)).toBeNull();
    });
});
