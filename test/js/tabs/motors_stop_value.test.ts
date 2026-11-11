import { createApp, h } from "vue";
import { createPinia, getActivePinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// jsdom has no ResizeObserver; reka-ui's Tooltip (behind UButton's title prop) needs one to mount.
globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mocks isolate MotorsTab.vue's own wiring — which value reaches the dialogs/composables — from their internal MSP/DShot logic, which didn't regress.
const {
    dialogOpen,
    stopAllMotors,
    sendMotorCommand,
    motorsTestingEnabled,
    configHasChanged,
    saveToEeprom,
    saveAndReboot,
    initializeDefaults,
} = vi.hoisted(() => {
    return {
        saveToEeprom: vi.fn(),
        saveAndReboot: vi.fn(),
        initializeDefaults: vi.fn(),
        dialogOpen: vi.fn(),
        stopAllMotors: vi.fn(),
        sendMotorCommand: vi.fn(),
        motorsTestingEnabled: { value: false },
        configHasChanged: { value: false },
    };
});

// The ESC sensor port pick, stubbed so the save path's port steps can be driven and observed.
const port = vi.hoisted(() => ({
    changed: { value: false },
    load: vi.fn(),
    write: vi.fn(),
    confirmPortConflicts: vi.fn(),
}));

vi.mock("@/composables/ports/useFeaturePort", async () => {
    const { ref } = await import("vue");
    return {
        useFeaturePort: () => ({
            available: ref(false),
            writable: ref(false),
            options: ref([]),
            selectedIdentifier: ref(null),
            changed: port.changed,
            conflict: ref(null),
            load: port.load,
            write: port.write,
        }),
    };
});

vi.mock("@/composables/ports/usePortConflicts", () => ({
    usePortConflicts: () => ({ confirmPortConflicts: port.confirmPortConflicts }),
}));

vi.mock("@/composables/useDialog", () => ({
    useDialog: () => ({ open: dialogOpen, close: vi.fn() }),
}));

vi.mock("@/composables/motors/useMotorTesting", () => ({
    useMotorTesting: () => ({
        motorsTestingEnabled,
        motorValues: ref(new Array(8).fill(1000)),
        masterValue: ref(1000),
        isArmed: ref(false),
        slidersDisabled: ref(false),
        sendMotorCommand,
        stopAllMotors,
    }),
}));

vi.mock("@/composables/motors/useMotorConfiguration", () => ({
    useMotorConfiguration: () => ({ setupConfigWatchers: vi.fn() }),
}));

vi.mock("@/composables/motors/useMotorDataPolling", () => ({
    useMotorDataPolling: () => {},
}));

vi.mock("@/composables/motors/useMotorsState", () => ({
    useMotorsState: () => ({
        analyticsChanges: ref({}),
        configChanges: ref({}),
        configHasChanged,
        feature3DEnabled: ref(true),
        armed: ref(false),
        numberOfValidOutputs: ref(4),
        defaultConfiguration: ref({}),
        initializeDefaults,
        trackChange: vi.fn(),
        resetChanges: vi.fn(),
    }),
}));

vi.mock("@/composables/useSaving", () => ({
    useSaving: () => ({
        isSaving: ref(false),
        runSave: (fn: () => unknown) => fn(),
    }),
}));

vi.mock("@/composables/useReboot", () => ({
    useReboot: () => ({ saveToEeprom, saveAndReboot }),
}));

vi.mock("@/composables/useBuildOptions", () => ({
    useBuildOptions: () => ({ hasBuildOption: () => true }),
}));

vi.mock("@/js/msp", () => ({
    default: { promise: vi.fn().mockResolvedValue(undefined), send_message: vi.fn() },
}));

vi.mock("@/js/msp/MSPHelper", () => ({
    mspHelper: { crunch: vi.fn(() => []) },
}));

vi.mock("@/js/Analytics", () => {
    const tracking = {
        sendSaveAndChangeEvents: vi.fn(),
        EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "flight_controller" },
    };
    return { getTracking: () => tracking };
});

vi.mock("@/js/ConfigStorage", () => ({
    get: vi.fn(() => ({})),
    set: vi.fn(),
}));

// Preserve real exports: useFeaturePort's chain eagerly loads the tab registry (all tabs, incl. SensorsTab's mag-calibration math) at import time.
vi.mock("@/js/utils/common", async (importOriginal) => ({
    ...(await importOriginal()),
    getMixerImageSrc: () => null,
}));

import MotorsTab from "../../../src/components/tabs/MotorsTab.vue";
import MSP from "../../../src/js/msp";
import MSPCodes from "../../../src/js/msp/MSPCodes";
import { MspCancelledError } from "../../../src/js/msp/mspErrors";
import UApp from "@nuxt/ui/components/App.vue";
import { useFlightControllerStore } from "../../../src/stores/fc";
import Features from "../../../src/js/Features";
import { mixerList } from "../../../src/js/model";

const QUAD_X_MIXER_ID = mixerList.findIndex((m) => m.name === "Quad X") + 1;
const DSHOT300_PROTOCOL_INDEX = 6;

let fcStore: ReturnType<typeof useFlightControllerStore>;

function mountMotorsTab() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp({ render: () => h(UApp, { portal: false }, { default: () => h(MotorsTab) }) });
    app.config.globalProperties.$t = ((key: string) => key) as unknown as typeof app.config.globalProperties.$t;
    // The Pinia configureFc() wrote FC state into: the store owns that state, so a second
    // instance here would mount the tab on fresh, unconfigured state.
    app.use(getActivePinia()!);
    app.mount(container);
    return {
        container,
        unmount() {
            app.unmount();
            container.remove();
        },
    };
}

interface FcOptions {
    enable3d: boolean;
    neutral: number;
    protocolIndex?: number;
}

function configureFc({ enable3d, neutral, protocolIndex = DSHOT300_PROTOCOL_INDEX }: FcOptions) {
    fcStore.resetState();
    fcStore.config.apiVersion = "1.47.0";
    fcStore.features.features = new Features(fcStore.config);
    if (enable3d) {
        fcStore.features.features.enable("3D");
    }
    fcStore.motor3dConfig.neutral = neutral;
    fcStore.motorConfig.mincommand = 1000;
    fcStore.motorConfig.maxthrottle = 2000;
    fcStore.motorConfig.motor_count = 4;
    fcStore.motorConfig.motor_poles = 14;
    fcStore.motorConfig.use_dshot_telemetry = true;
    fcStore.mixerConfig.mixer = QUAD_X_MIXER_ID;
    fcStore.mixerConfig.reverseMotorDir = 0;
    fcStore.pidAdvancedConfig.fast_pwm_protocol = protocolIndex;
    fcStore.pidAdvancedConfig.motorIdle = 6.5;
    fcStore.motorOutputOrder = [0, 1, 2, 3];
}

const PWM_ANALOG_PROTOCOL_INDEX = 0;

function findButton(container: HTMLElement, text: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
    expect(button).toBeTruthy();
    return button!;
}

/** The motor-testing enable switch, in the red notice box under motorsNotice. */
function motorTestingSwitch(container: HTMLElement): HTMLButtonElement {
    const notice = [...container.querySelectorAll("p")].find((el) => el.textContent === "motorsNotice");
    const toggle = notice?.parentElement?.querySelector<HTMLButtonElement>('button[role="switch"]');
    expect(toggle).toBeTruthy();
    return toggle!;
}

function dialogCall(name: string) {
    const call = dialogOpen.mock.calls.find((c) => c[0] === name);
    expect(call).toBeDefined();
    return call!;
}

describe("MotorsTab 3D motor-stop-value wiring", () => {
    let wrapper: ReturnType<typeof mountMotorsTab> | null;

    beforeEach(() => {
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        motorsTestingEnabled.value = false;
        configHasChanged.value = false;
        dialogOpen.mockClear();
        stopAllMotors.mockClear();
        sendMotorCommand.mockClear();
        saveToEeprom.mockClear();
        saveAndReboot.mockClear();
        initializeDefaults.mockClear();
        port.changed.value = false;
        port.load.mockReset().mockResolvedValue(undefined);
        port.write.mockReset().mockResolvedValue(undefined);
        port.confirmPortConflicts.mockReset().mockResolvedValue(true);
        vi.mocked(MSP.promise).mockClear();
        vi.mocked(MSP.send_message).mockClear();
    });

    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    async function mountReady(fcOptions: FcOptions) {
        configureFc(fcOptions);
        const mounted = mountMotorsTab();
        wrapper = mounted;
        // onMounted awaits several MSP.promise() calls in sequence before wiring is ready.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        return mounted.container;
    }

    it("passes the 3D neutral, not the DShot-disarmed floor, to the ESC direction dialog", async () => {
        const container = await mountReady({ enable3d: true, neutral: 1500 });

        const button = findButton(container, "escDshotDirectionDialog-Open");
        button.click();

        expect(dialogOpen).toHaveBeenCalledWith(
            "EscDshotDirectionDialog",
            expect.objectContaining({
                motorConfig: expect.objectContaining({ motorStopValue: 1500 }),
            }),
            expect.anything(),
        );
        const call = dialogCall("EscDshotDirectionDialog");
        expect(call[1].motorConfig.motorStopValue).not.toBe(1000);
    });

    it("sends 1500 for DShot 3D even when the configured neutral is not 1500", async () => {
        const container = await mountReady({ enable3d: true, neutral: 1460 });

        const button = findButton(container, "escDshotDirectionDialog-Open");
        button.click();

        const call = dialogCall("EscDshotDirectionDialog");
        expect(call[1].motorConfig.motorStopValue).toBe(1500);
    });

    it("passes the DShot 3D stop value, not the configured neutral, to the motor output reorder dialog", async () => {
        const container = await mountReady({ enable3d: true, neutral: 1460 });

        const button = findButton(container, "motorOutputReorderDialogOpen");
        button.click();

        const call = dialogCall("MotorOutputReorderingDialog");
        expect(call[1].motorStopValue).toBe(1500);
        expect(call[1].motorStopValue).not.toBe(1000);
    });

    it("falls back to the DShot-disarmed floor when 3D mode is disabled", async () => {
        const container = await mountReady({ enable3d: false, neutral: 1500 });

        const button = findButton(container, "escDshotDirectionDialog-Open");
        button.click();

        const call = dialogCall("EscDshotDirectionDialog");
        expect(call[1].motorConfig.motorStopValue).toBe(1000);
    });

    it("stops motors at the DShot 3D stop value, not the configured neutral, before a config save", async () => {
        motorsTestingEnabled.value = true;
        configHasChanged.value = true;
        await mountReady({ enable3d: true, neutral: 1460 });

        const saveButton = findButton(wrapper!.container, "configurationButtonSave");
        saveButton.click();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(stopAllMotors).toHaveBeenCalledWith(1500);
        expect(motorsTestingEnabled.value).toBe(false);
    });

    it("stops motors at the previously-applied value, not a pending unsaved 3D-enable edit, on save", async () => {
        configHasChanged.value = true;
        const container = await mountReady({ enable3d: false, neutral: 1500 });

        // Simulate an unsaved edit: enable the 3D feature in the UI without saving yet.
        const feature3dLabel = [...container.querySelectorAll("span")].find((el) => el.textContent === "feature3D");
        const row = feature3dLabel!.closest(".flex.items-center.gap-2")!;
        row.querySelector<HTMLButtonElement>('button[role="switch"]')!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const saveButton = findButton(container, "configurationButtonSave");
        saveButton.click();
        await new Promise((resolve) => setTimeout(resolve, 100));

        // The flight controller is still running non-3D at this instant (the feature push hasn't
        // reached it yet), so the pre-save stop must use the applied non-3D interpretation (1000),
        // not the pending 3D-enable edit (1500) — the FC would read 1500 as throttle, not stop.
        expect(stopAllMotors).toHaveBeenCalledWith(1000);
        expect(stopAllMotors).not.toHaveBeenCalledWith(1500);
    });

    it("stops motors at the previously-applied value, not a pending unsaved protocol edit, on save", async () => {
        configHasChanged.value = true;
        await mountReady({ enable3d: true, neutral: 1460, protocolIndex: PWM_ANALOG_PROTOCOL_INDEX });

        // Simulate an unsaved edit: switch to a DShot protocol without saving yet. The store is
        // reactive, so this mutation is picked up the same way selectedEscProtocol's
        // own setter would update it through the real USelect control.
        fcStore.pidAdvancedConfig.fast_pwm_protocol = DSHOT300_PROTOCOL_INDEX;
        await new Promise((resolve) => setTimeout(resolve, 0));

        const saveButton = findButton(wrapper!.container, "configurationButtonSave");
        saveButton.click();
        await new Promise((resolve) => setTimeout(resolve, 100));

        // The flight controller is still running analog PWM at this instant, so the pre-save stop
        // must use the applied analog neutral (1460), not the pending DShot interpretation (1500).
        expect(stopAllMotors).toHaveBeenCalledWith(1460);
        expect(stopAllMotors).not.toHaveBeenCalledWith(1500);
    });

    it("stops motors at the DShot 3D stop value, not the configured neutral, when the tab unmounts mid-test", async () => {
        await mountReady({ enable3d: true, neutral: 1460 });
        motorsTestingEnabled.value = true;

        wrapper!.unmount();

        expect(sendMotorCommand).toHaveBeenCalledWith(new Array(8).fill(1500));
    });

    it("polls one IMU sample per sensor-rate tick for the graph", async () => {
        await mountReady({ enable3d: false, neutral: 1500 });
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(MSP.send_message).toHaveBeenCalledWith(MSPCodes.MSP_RAW_IMU, false, false, expect.any(Function));
    });

    it("the Save button writes the motor configuration and reboots", async () => {
        configHasChanged.value = true;
        const container = await mountReady({ enable3d: false, neutral: 1500 });

        findButton(container, "configurationButtonSave").click();
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_SET_MOTOR_CONFIG, []);
        expect(saveAndReboot).toHaveBeenCalledOnce();
        expect(saveToEeprom).not.toHaveBeenCalled();
    });

    it("initialises the change baseline only once the whole load has landed", async () => {
        let release!: () => void;
        vi.mocked(MSP.promise).mockImplementation((code) =>
            code === MSPCodes.MSP_ARMING_CONFIG
                ? new Promise((resolve) => {
                      release = () => resolve(undefined);
                  })
                : Promise.resolve(undefined),
        );
        try {
            await mountReady({ enable3d: false, neutral: 1500 });
            expect(MSP.promise).toHaveBeenCalledWith(MSPCodes.MSP_ARMING_CONFIG);
            expect(initializeDefaults).not.toHaveBeenCalled();

            release();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(initializeDefaults).toHaveBeenCalledOnce();
        } finally {
            vi.mocked(MSP.promise).mockResolvedValue(undefined);
        }
    });

    it("saves a port change alone, through the port's conflict check and write", async () => {
        port.changed.value = true;
        const container = await mountReady({ enable3d: false, neutral: 1500 });

        findButton(container, "configurationButtonSave").click();
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(port.confirmPortConflicts).toHaveBeenCalledOnce();
        expect(port.write).toHaveBeenCalledOnce();
        expect(saveAndReboot).toHaveBeenCalledOnce();
    });

    it("adopts the saved configuration as the applied one, so the next save stops under it", async () => {
        configHasChanged.value = true;
        const container = await mountReady({ enable3d: false, neutral: 1500 });

        const feature3dLabel = [...container.querySelectorAll("span")].find((el) => el.textContent === "feature3D");
        feature3dLabel!
            .closest(".flex.items-center.gap-2")!
            .querySelector<HTMLButtonElement>('button[role="switch"]')!
            .click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        findButton(container, "configurationButtonSave").click();
        await new Promise((resolve) => setTimeout(resolve, 200));
        findButton(container, "configurationButtonSave").click();
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(stopAllMotors.mock.calls).toEqual([[1000], [1500]]);
    });

    it("logs a failed load and skips state init, instead of an unhandled rejection", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        port.load.mockRejectedValue(new Error("MSP timeout"));

        const container = await mountReady({ enable3d: false, neutral: 1500 });

        expect(consoleError).toHaveBeenCalledWith("Failed to load motors data:", expect.any(Error));
        expect(initializeDefaults).not.toHaveBeenCalled();
        // The motor stop snapshot was taken before the ESC sensor port failed; testing must stay off.
        expect(motorTestingSwitch(container).disabled).toBe(true);
    });

    it("enables motor testing once the whole load has succeeded", async () => {
        const container = await mountReady({ enable3d: false, neutral: 1500 });

        expect(motorTestingSwitch(container).disabled).toBe(false);
    });

    it("stays quiet when the load is cancelled by a tab switch or disconnect", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        port.load.mockRejectedValue(new MspCancelledError("cleared", undefined, "cleanup"));

        await mountReady({ enable3d: false, neutral: 1500 });

        expect(consoleError).not.toHaveBeenCalledWith("Failed to load motors data:", expect.anything());
        expect(initializeDefaults).not.toHaveBeenCalled();
    });
});
