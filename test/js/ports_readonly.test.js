import { describe, expect, it } from "vitest";
import { serialPortsAreReadOnly } from "../../src/composables/ports/usePortsReadOnly";
import {
    API_VERSION_1_44,
    API_VERSION_1_45,
    API_VERSION_1_46,
    API_VERSION_1_47,
    API_VERSION_1_48,
    API_VERSION_1_49,
} from "../../src/js/data_storage";

describe("serialPortsAreReadOnly", () => {
    it("leaves the ports tab writable on every firmware that still accepts the write", () => {
        for (const apiVersion of [
            API_VERSION_1_44,
            API_VERSION_1_45,
            API_VERSION_1_46,
            API_VERSION_1_47,
            API_VERSION_1_48,
        ]) {
            expect(serialPortsAreReadOnly(apiVersion)).toBe(false);
        }
    });

    it("goes read only from 1.49, where the feature owns its own port", () => {
        expect(serialPortsAreReadOnly(API_VERSION_1_49)).toBe(true);
    });

    it("stays read only on later versions", () => {
        expect(serialPortsAreReadOnly("1.50.0")).toBe(true);
        expect(serialPortsAreReadOnly("2.0.0")).toBe(true);
    });

    it("treats a patch release of 1.48 as writable and of 1.49 as read only", () => {
        expect(serialPortsAreReadOnly("1.48.9")).toBe(false);
        expect(serialPortsAreReadOnly("1.49.1")).toBe(true);
    });

    it("falls back to writable when the version cannot be read", () => {
        expect(serialPortsAreReadOnly("")).toBe(false);
        expect(serialPortsAreReadOnly(undefined)).toBe(false);
        expect(serialPortsAreReadOnly("not-a-version")).toBe(false);
    });
});
