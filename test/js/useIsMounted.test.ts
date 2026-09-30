import { afterEach, describe, expect, it } from "vitest";
import { createApp, type App, type Ref } from "vue";
import { useIsMounted } from "../../src/composables/useIsMounted";

describe("useIsMounted", () => {
    let app: App | null = null;

    afterEach(() => {
        app?.unmount();
        app = null;
    });

    it("is false before mount and true once mounted", () => {
        let isMounted!: Ref<boolean>;
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
        let isMounted!: Ref<boolean>;
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
