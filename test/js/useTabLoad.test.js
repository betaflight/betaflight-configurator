import { describe, expect, it, vi } from "vitest";
import { runTabLoad } from "../../src/composables/useTabLoad";
import { MspCancelledError } from "../../src/js/msp/mspErrors";

describe("useTabLoad", () => {
    it("returns the loader's resolved value on success and never calls onError", async () => {
        const onError = vi.fn();

        const result = await runTabLoad(() => Promise.resolve("ok"), onError);

        expect(result).toBe("ok");
        expect(onError).not.toHaveBeenCalled();
    });

    it("swallows a benign MspCancelledError silently (no onError call)", async () => {
        const onError = vi.fn();
        const error = new MspCancelledError("MSP queue cleared", undefined, "cleanup");

        const result = await runTabLoad(() => Promise.reject(error), onError);

        expect(result).toBeUndefined();
        expect(onError).not.toHaveBeenCalled();
    });

    it("routes a genuine failure to onError", async () => {
        const onError = vi.fn();
        const error = new Error("timeout");

        const result = await runTabLoad(() => Promise.reject(error), onError);

        expect(result).toBeUndefined();
        expect(onError).toHaveBeenCalledWith(error);
    });
});
