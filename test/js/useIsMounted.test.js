import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "vue";
import { useIsMounted } from "../../src/composables/useIsMounted";

describe("useIsMounted", () => {
    let app;

    afterEach(() => {
        app?.unmount();
        app = null;
    });

    it("is false before mount and true once mounted", () => {
        let isMounted;
        const TestComponent = {
            setup() {
                isMounted = useIsMounted();
                expect(isMounted.value).toBe(false);
                return () => null;
            },
        };

        app = createApp(TestComponent);
        app.mount(document.createElement("div"));

        expect(isMounted.value).toBe(true);
    });

    it("becomes false again after unmount", () => {
        let isMounted;
        const TestComponent = {
            setup() {
                isMounted = useIsMounted();
                return () => null;
            },
        };

        app = createApp(TestComponent);
        app.mount(document.createElement("div"));
        expect(isMounted.value).toBe(true);

        app.unmount();
        expect(isMounted.value).toBe(false);
    });
});
