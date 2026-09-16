import { describe, expect, it, beforeEach } from "vitest";
import { createPinia, setActivePinia, storeToRefs } from "pinia";
import { isRef, nextTick, watch } from "vue";
import { useSensorsStore } from "../../../src/stores/sensors";

describe("sensors store through storeToRefs", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it("hands out refs for plain refs and for reactive() members alike", () => {
        const store = useSensorsStore();
        const { checkboxes, globalRate, rates, scales, debugScales, debugColumns } = storeToRefs(store);

        for (const [name, value] of Object.entries({
            checkboxes,
            globalRate,
            rates,
            scales,
            debugScales,
            debugColumns,
        })) {
            expect(isRef(value), `${name} should be a ref`).toBe(true);
        }

        expect(globalRate.value).toBe(50);
        expect(checkboxes.value).toHaveLength(7);
        // `rates` and `scales` are reactive() objects inside the store, not refs.
        expect(rates.value).toBeTypeOf("object");
        expect(scales.value).toBeTypeOf("object");
    });

    it("keeps the destructured refs wired to the store in both directions", async () => {
        const store = useSensorsStore();
        const { globalRate, rates } = storeToRefs(store);

        const seen = [];
        watch(globalRate, (v) => seen.push(v));

        // store -> ref
        store.updateGlobalRate(125);
        await nextTick();
        expect(globalRate.value).toBe(125);
        expect(seen).toContain(125);

        // ref -> store
        globalRate.value = 200;
        await nextTick();
        expect(store.globalRate).toBe(200);

        // a reactive() member stays live through the ref
        const firstKey = Object.keys(rates.value)[0];
        const original = rates.value[firstKey];
        store.rates[firstKey] = original === 10 ? 20 : 10;
        await nextTick();
        expect(rates.value[firstKey]).toBe(store.rates[firstKey]);
        expect(rates.value[firstKey]).not.toBe(original);
    });
});
