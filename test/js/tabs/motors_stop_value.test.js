import { createApp, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// jsdom has no ResizeObserver; reka-ui's Tooltip (behind UButton's title prop) needs one to mount.
globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mocks isolate MotorsTab.vue's own wiring — which value reaches the dialogs/composables — from their internal MSP/DShot logic, which didn't regress.
const { dialogOpen, stopAllMotors, sendMotorCommand, motorsTestingEnabled, configHasChanged } = vi.hoisted(() => {
    return {
        dialogOpen: vi.fn(),
        stopAllMotors: vi.fn(),
        sendMotorCommand: vi.fn(),
        motorsTestingEnabled: { value: false },
        configHasChanged: { value: false },
    };
});

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
        initializeDefaults: vi.fn(),
        trackChange: vi.fn(),
        resetChanges: vi.fn(),
    }),
}));

vi.mock("@/composables/useSaving", () => ({
    useSaving: () => ({
        isSaving: ref(false),
        runSave: (fn) => fn(),
    }),
}));

vi.mock("@/composables/useReboot", () => ({
    useReboot: () => ({ saveToEeprom: vi.fn(), saveAndReboot: vi.fn() }),
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

vi.mock("@/js/Analytics", () => ({
    tracking: {
        sendSaveAndChangeEvents: vi.fn(),
        EVENT_CATEGORIES: { FLIGHT_CONTROLLER: "flight_controller" },
    },
}));

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
import UApp from "@nuxt/ui/components/App.vue";
import FC from "../../../src/js/fc";
import Features from "../../../src/js/Features";
import { mixerList } from "../../../src/js/model";

const QUAD_X_MIXER_ID = mixerList.findIndex((m) => m.name === "Quad X") + 1;
const DSHOT300_PROTOCOL_INDEX = 6;

function mountMotorsTab() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const app = createApp({ render: () => h(UApp, { portal: false }, { default: () => h(MotorsTab) }) });
    app.config.globalProperties.$t = (key) => key;
    app.use(createPinia());
    app.mount(container);
    return {
        container,
        unmount() {
            app.unmount();
            container.remove();
        },
    };
}

function configureFc({ enable3d, neutral }) {
    FC.resetState();
    FC.CONFIG.apiVersion = "1.47.0";
    FC.FEATURE_CONFIG.features = new Features(FC.CONFIG);
    if (enable3d) {
        FC.FEATURE_CONFIG.features.enable("3D");
    }
    FC.MOTOR_3D_CONFIG.neutral = neutral;
    FC.MOTOR_CONFIG.mincommand = 1000;
    FC.MOTOR_CONFIG.maxthrottle = 2000;
    FC.MOTOR_CONFIG.motor_count = 4;
    FC.MOTOR_CONFIG.motor_poles = 14;
    FC.MOTOR_CONFIG.use_dshot_telemetry = true;
    FC.MIXER_CONFIG.mixer = QUAD_X_MIXER_ID;
    FC.MIXER_CONFIG.reverseMotorDir = 0;
    FC.PID_ADVANCED_CONFIG.fast_pwm_protocol = DSHOT300_PROTOCOL_INDEX;
    FC.PID_ADVANCED_CONFIG.motorIdle = 6.5;
    FC.MOTOR_OUTPUT_ORDER = [0, 1, 2, 3];
}

describe("MotorsTab 3D motor-stop-value wiring", () => {
    let wrapper;

    beforeEach(() => {
        setActivePinia(createPinia());
        motorsTestingEnabled.value = false;
        configHasChanged.value = false;
        dialogOpen.mockClear();
        stopAllMotors.mockClear();
        sendMotorCommand.mockClear();
    });

    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    async function mountReady(fcOptions) {
        configureFc(fcOptions);
        wrapper = mountMotorsTab();
        // onMounted awaits several MSP.promise() calls in sequence before wiring is ready.
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        return wrapper.container;
    }

    it("passes the 3D neutral, not the DShot-disarmed floor, to the ESC direction dialog", async () => {
        const container = await mountReady({ enable3d: true, neutral: 1500 });

        const button = [...container.querySelectorAll("button")].find((b) =>
            b.textContent.includes("escDshotDirectionDialog-Open"),
        );
        expect(button).toBeTruthy();
        button.click();

        expect(dialogOpen).toHaveBeenCalledWith(
            "EscDshotDirectionDialog",
            expect.objectContaining({
                motorConfig: expect.objectContaining({ motorStopValue: 1500 }),
            }),
            expect.anything(),
        );
        const call = dialogOpen.mock.calls.find((c) => c[0] === "EscDshotDirectionDialog");
        expect(call[1].motorConfig.motorStopValue).not.toBe(1000);
    });

    it("passes a non-default 3D neutral to the ESC direction dialog", async () => {
        const container = await mountReady({ enable3d: true, neutral: 1460 });

        const button = [...container.querySelectorAll("button")].find((b) =>
            b.textContent.includes("escDshotDirectionDialog-Open"),
        );
        button.click();

        const call = dialogOpen.mock.calls.find((c) => c[0] === "EscDshotDirectionDialog");
        expect(call[1].motorConfig.motorStopValue).toBe(1460);
    });

    it("passes the 3D neutral, not the DShot-disarmed floor, to the motor output reorder dialog", async () => {
        const container = await mountReady({ enable3d: true, neutral: 1500 });

        const button = [...container.querySelectorAll("button")].find((b) =>
            b.textContent.includes("motorOutputReorderDialogOpen"),
        );
        expect(button).toBeTruthy();
        button.click();

        const call = dialogOpen.mock.calls.find((c) => c[0] === "MotorOutputReorderingDialog");
        expect(call[1].motorStopValue).toBe(1500);
        expect(call[1].motorStopValue).not.toBe(1000);
    });

    it("falls back to the DShot-disarmed floor when 3D mode is disabled", async () => {
        const container = await mountReady({ enable3d: false, neutral: 1500 });

        const button = [...container.querySelectorAll("button")].find((b) =>
            b.textContent.includes("escDshotDirectionDialog-Open"),
        );
        button.click();

        const call = dialogOpen.mock.calls.find((c) => c[0] === "EscDshotDirectionDialog");
        expect(call[1].motorConfig.motorStopValue).toBe(1000);
    });

    it("stops motors at the 3D neutral (not the disarmed floor) before a config save", async () => {
        motorsTestingEnabled.value = true;
        configHasChanged.value = true;
        await mountReady({ enable3d: true, neutral: 1500 });

        const saveButton = [...wrapper.container.querySelectorAll("button")].find((b) =>
            b.textContent.includes("configurationButtonSave"),
        );
        expect(saveButton).toBeTruthy();
        saveButton.click();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(stopAllMotors).toHaveBeenCalledWith(1500);
    });

    it("stops motors at the 3D neutral (not the disarmed floor) when the tab unmounts mid-test", async () => {
        await mountReady({ enable3d: true, neutral: 1500 });
        motorsTestingEnabled.value = true;

        wrapper.unmount();

        expect(sendMotorCommand).toHaveBeenCalledWith(new Array(8).fill(1500));
    });
});
