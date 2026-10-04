import { describe, expect, it } from "vitest";

import {
    consumeDeleteAccountFocus,
    isDeleteAccountPath,
    requestDeleteAccountFocus,
} from "../../src/js/utils/deleteAccountLink";

describe("isDeleteAccountPath", () => {
    it("matches /delete with or without a trailing slash", () => {
        expect(isDeleteAccountPath("/delete")).toBe(true);
        expect(isDeleteAccountPath("/delete/")).toBe(true);
    });

    it("rejects every other path", () => {
        expect(isDeleteAccountPath("/")).toBe(false);
        expect(isDeleteAccountPath("")).toBe(false);
        expect(isDeleteAccountPath("/deleted")).toBe(false);
        expect(isDeleteAccountPath("/delete/me")).toBe(false);
        expect(isDeleteAccountPath("/Delete")).toBe(false);
        expect(isDeleteAccountPath("/app/delete")).toBe(false);
    });
});

describe("delete account focus intent", () => {
    it("is not set by default", () => {
        expect(consumeDeleteAccountFocus()).toBe(false);
    });

    it("is consumed exactly once", () => {
        requestDeleteAccountFocus();

        expect(consumeDeleteAccountFocus()).toBe(true);
        expect(consumeDeleteAccountFocus()).toBe(false);
    });
});
