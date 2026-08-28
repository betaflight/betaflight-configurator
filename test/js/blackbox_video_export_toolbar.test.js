import { createApp, h, nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { TooltipProvider } from "reka-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppToolbar from "../../src/blackbox-viewer/components/AppToolbar.vue";
import { useLogStore } from "../../src/blackbox-viewer/stores/log.js";
import { probeVideoExport } from "../../src/blackbox-viewer/video_export.js";

vi.mock("../../src/blackbox-viewer/video_export.js", () => ({
    probeVideoExport: vi.fn(),
}));

async function flushProbe() {
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();
}

describe("blackbox video export toolbar", () => {
    let app;
    let host;

    afterEach(() => {
        app?.unmount();
        host?.remove();
        app = null;
        host = null;
        vi.resetAllMocks();
    });

    it("exposes an unavailable encoder reason from the disabled Export Video control", async () => {
        const reason = "No supported video codec found; install the required Linux encoder plugins";
        probeVideoExport.mockResolvedValue({ canEncode: false, reason });

        const pinia = createPinia();
        setActivePinia(pinia);
        useLogStore().setFlightLog({});

        host = document.createElement("div");
        document.body.appendChild(host);
        app = createApp({
            render: () => h(TooltipProvider, null, () => h(AppToolbar)),
        });
        app.use(pinia);
        app.mount(host);
        await flushProbe();

        const button = [...host.querySelectorAll("button")].find((element) =>
            element.textContent.includes("Export Video"),
        );
        expect(button).toBeTruthy();
        expect(button.disabled).toBe(true);

        const explanationTrigger = button.closest('[data-testid="video-export-capability"]');
        expect(explanationTrigger).toBeTruthy();
        expect(explanationTrigger.getAttribute("role")).toBe("group");
        expect(explanationTrigger.getAttribute("aria-disabled")).toBe("true");
        expect(explanationTrigger.getAttribute("aria-label")).toBe(`Export Video unavailable: ${reason}`);
        expect(explanationTrigger.getAttribute("tabindex")).toBe("0");
        expect(button.classList.contains("pointer-events-none")).toBe(true);

        explanationTrigger.focus();
        await new Promise((resolve) => setTimeout(resolve, 350));
        await nextTick();
        expect(document.body.textContent).toContain(reason);
    });

    it("keeps Export Video interactive when an encoder is available", async () => {
        probeVideoExport.mockResolvedValue({ canEncode: true, codec: "avc" });

        const pinia = createPinia();
        const onExportVideo = vi.fn();
        setActivePinia(pinia);
        useLogStore().setFlightLog({});

        host = document.createElement("div");
        document.body.appendChild(host);
        app = createApp({
            render: () => h(TooltipProvider, null, () => h(AppToolbar, { onExportVideo })),
        });
        app.use(pinia);
        app.mount(host);
        await flushProbe();

        const button = [...host.querySelectorAll("button")].find((element) =>
            element.textContent.includes("Export Video"),
        );
        const explanationTrigger = button.closest('[data-testid="video-export-capability"]');

        expect(button.disabled).toBe(false);
        expect(button.classList.contains("pointer-events-none")).toBe(false);
        expect(explanationTrigger.hasAttribute("role")).toBe(false);
        expect(explanationTrigger.hasAttribute("aria-disabled")).toBe(false);
        expect(explanationTrigger.hasAttribute("aria-label")).toBe(false);
        expect(explanationTrigger.hasAttribute("tabindex")).toBe(false);

        button.click();
        expect(onExportVideo).toHaveBeenCalledOnce();
    });
});
