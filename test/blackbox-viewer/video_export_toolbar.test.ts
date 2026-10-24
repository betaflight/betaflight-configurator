import { createApp, h, nextTick, type App } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { TooltipProvider } from "reka-ui";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppToolbar from "../../src/blackbox-viewer/components/AppToolbar.vue";
import { useLogStore } from "../../src/blackbox-viewer/stores/log";
import { probeVideoExport } from "../../src/blackbox-viewer/video_export";
import type { FlightLog } from "../../src/blackbox-viewer/flightlog";

vi.mock("../../src/blackbox-viewer/video_export", () => ({
    probeVideoExport: vi.fn(),
}));

async function flushProbe() {
    await Promise.resolve();
    await nextTick();
    await Promise.resolve();
    await nextTick();
}

function findExportButton(host: HTMLElement): HTMLButtonElement {
    const button = [...host.querySelectorAll("button")].find((element) =>
        element.textContent?.includes("Export Video"),
    );
    expect(button).toBeTruthy();
    return button!;
}

describe("blackbox video export toolbar", () => {
    let app: App | null = null;
    let host: HTMLDivElement | null = null;

    afterEach(() => {
        app?.unmount();
        host?.remove();
        app = null;
        host = null;
        vi.resetAllMocks();
    });

    it("exposes an unavailable encoder reason from the disabled Export Video control", async () => {
        const reason = "No supported video codec found; install the required Linux encoder plugins";
        vi.mocked(probeVideoExport).mockResolvedValue({ canEncode: false, reason });

        const pinia = createPinia();
        setActivePinia(pinia);
        useLogStore().setFlightLog({} as FlightLog);

        host = document.createElement("div");
        document.body.appendChild(host);
        app = createApp({
            render: () => h(TooltipProvider, null, () => h(AppToolbar)),
        });
        app.use(pinia);
        app.mount(host);
        await flushProbe();

        const button = findExportButton(host);
        expect(button.disabled).toBe(true);

        const explanationTrigger = button.closest<HTMLElement>('[data-testid="video-export-capability"]')!;
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
        vi.mocked(probeVideoExport).mockResolvedValue({
            canEncode: true,
            codec: "avc",
            container: "mp4",
            extension: "mp4",
            description: "MP4 video",
            saveMode: "stream",
            androidBridge: false,
        });

        const pinia = createPinia();
        const onExportVideo = vi.fn();
        setActivePinia(pinia);
        useLogStore().setFlightLog({} as FlightLog);

        host = document.createElement("div");
        document.body.appendChild(host);
        app = createApp({
            render: () => h(TooltipProvider, null, () => h(AppToolbar, { onExportVideo })),
        });
        app.use(pinia);
        app.mount(host);
        await flushProbe();

        const button = findExportButton(host);
        const explanationTrigger = button.closest<HTMLElement>('[data-testid="video-export-capability"]')!;

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
