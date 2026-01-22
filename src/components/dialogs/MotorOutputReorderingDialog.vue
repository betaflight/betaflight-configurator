<template>
    <dialog ref="dialogRef" class="motorOutputReordering-dialog" @cancel="handleCancel">
        <div class="motorOutputReorderComponent">
            <h3 class="motorOutputReorderComponentHeader" v-html="i18nMessage('motorsRemapDialogTitle')"></h3>

            <!-- Main Content -->
            <div v-if="showMainContent" class="componentContent" id="dialogMotorOutputReorderMainContent">
                <canvas ref="canvasRef" id="motorOutputReorderCanvas"></canvas>
                <div id="motorOutputReorderActionPanel">
                    <h4 id="motorOutputReorderActionHint">{{ actionHintText }}</h4>
                </div>
                <div v-if="showSaveButtons" id="motorOutputReorderSaveStartOverButtonsPanel">
                    <a
                        href="#"
                        class="regular-button left"
                        @click.prevent="save"
                        v-html="i18nMessage('motorsRemapDialogSave')"
                    ></a>
                    <a
                        href="#"
                        class="regular-button left"
                        @click.prevent="startOver"
                        v-html="i18nMessage('motorsRemapDialogStartOver')"
                    ></a>
                </div>
            </div>

            <!-- Warning/Start Screen -->
            <div v-if="!showMainContent" class="componentContent" id="dialogMotorOutputReorderWarning">
                <div class="notice">
                    <p class="motorsRemapDialogRiskNoticeText" v-html="i18nMessage('motorsRemapDialogRiskNotice')"></p>
                    <div class="motorsRemapToggleParentContainer">
                        <div class="motorsRemapToggleNarrow">
                            <input
                                id="motorsEnableTestMode-dialogMotorOutputReorder"
                                type="checkbox"
                                class="toggle"
                                v-model="safetyAgreed"
                            />
                        </div>
                        <div class="motorsRemapToggleWide">
                            <span
                                class="motorsEnableTestMode motorsRemapDialogRiskNoticeText"
                                v-html="i18nMessage('motorsRemapDialogUnderstandRisks')"
                            ></span>
                        </div>
                    </div>
                    <div
                        class="motorsRemapDialogRExplanationText"
                        v-html="i18nMessage('motorsRemapDialogExplanations')"
                    ></div>
                </div>
                <div class="buttons">
                    <a
                        v-if="safetyAgreed"
                        href="#"
                        class="regular-button"
                        @click.prevent="onStartButtonClicked"
                        v-html="i18nMessage('motorOutputReorderDialogAgree')"
                    ></a>
                    <a href="#" class="regular-button" @click.prevent="close" v-html="i18nMessage('dialogCancel')"></a>
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import MotorOutputReorderCanvas from "@/components/MotorOutputReordering/MotorOutputReorderingCanvas";
import MotorOutputReorderConfig from "@/components/MotorOutputReordering/MotorOutputReorderingConfig";
import { mspHelper } from "@/js/msp/MSPHelper";
import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import GUI from "@/js/gui";

const props = defineProps({
    droneConfiguration: {
        type: String,
        required: true,
    },
    motorStopValue: {
        type: Number,
        required: true,
    },
    motorSpinValue: {
        type: Number,
        required: true,
    },
});

const emit = defineEmits(["close"]);

const fcStore = useFlightControllerStore();
const dialogRef = ref(null);
const canvasRef = ref(null);

// State
const safetyAgreed = ref(false);
const showMainContent = ref(false);
const showSaveButtons = ref(false);
const actionHintText = ref("");

// Motor jerking state
let currentJerkingTimeout = -1;
let currentJerkingMotor = -1;
let currentSpinningMotor = -1;

// Canvas instance
let motorOutputReorderCanvas = null;
let config = null;

// New motor output order
let newMotorOutputReorder = [];

// Constants
const JERKING_SPIN_DURATION = 250;
const JERKING_PAUSE_DURATION = 500;

// Translation helper
const i18nMessage = (key) => {
    return window.i18n.getMessage(key);
};

// Initialize config
const initializeConfig = () => {
    config = new MotorOutputReorderConfig(100);
};

// Motor spinning
const spinMotor = (motorIndex) => {
    currentSpinningMotor = motorIndex;
    const buffer = [];

    const numberOfMotors = config[props.droneConfiguration].Motors.length;

    for (let i = 0; i < numberOfMotors; i++) {
        if (i === motorIndex) {
            buffer.push16(props.motorSpinValue);
        } else {
            buffer.push16(props.motorStopValue);
        }
    }

    MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);
};

const stopMotor = () => {
    if (currentSpinningMotor !== -1) {
        spinMotor(-1);
    }
};

// Motor jerking (for identification)
const stopAnyMotorJerking = () => {
    if (currentJerkingTimeout !== -1) {
        clearTimeout(currentJerkingTimeout);
        currentJerkingTimeout = -1;
        spinMotor(-1);
    }
    currentJerkingMotor = -1;
};

const motorStartTimeout = (motorIndex) => {
    spinMotor(motorIndex);
    currentJerkingTimeout = setTimeout(() => {
        motorStopTimeout(motorIndex);
    }, JERKING_SPIN_DURATION);
};

const motorStopTimeout = (motorIndex) => {
    spinMotor(-1);
    currentJerkingTimeout = setTimeout(() => {
        motorStartTimeout(motorIndex);
    }, JERKING_PAUSE_DURATION);
};

const startMotorJerking = (motorIndex) => {
    stopAnyMotorJerking();
    currentJerkingMotor = motorIndex;
    motorStartTimeout(motorIndex);
};

// Motor click callback
const onMotorClick = (motorIndex) => {
    if (!motorOutputReorderCanvas) return;

    motorOutputReorderCanvas.readyMotors.push(motorIndex);
    currentJerkingMotor++;

    const numberOfMotors = config[props.droneConfiguration].Motors.length;

    if (currentJerkingMotor < numberOfMotors) {
        startMotorJerking(currentJerkingMotor);
    } else {
        stopAnyMotorJerking();
        actionHintText.value = window.i18n.getMessage("motorOutputReorderDialogRemapIsDone");
        calculateNewMotorOutputReorder();
        motorOutputReorderCanvas.remappingReady = true;
        showSaveButtons.value = true;
    }
};

// Motor spin callback (for user testing after remapping)
const spinMotorCallback = (motorIndex) => {
    let indexToSpin = -1;

    if (motorIndex !== -1 && motorOutputReorderCanvas) {
        indexToSpin = motorOutputReorderCanvas.readyMotors.indexOf(motorIndex);
    }

    spinMotor(indexToSpin);
};

// Calculate new motor output reorder
const calculateNewMotorOutputReorder = () => {
    if (!motorOutputReorderCanvas) return;

    newMotorOutputReorder = [];

    for (let i = 0; i < motorOutputReorderCanvas.readyMotors.length; i++) {
        newMotorOutputReorder.push(remapMotorIndex(i));
    }
};

const remapMotorIndex = (motorIndex) => {
    if (!motorOutputReorderCanvas) return motorIndex;
    return fcStore.motorOutputOrder[motorOutputReorderCanvas.readyMotors.indexOf(motorIndex)];
};

// User interaction
const stopUserInteraction = () => {
    if (motorOutputReorderCanvas) {
        motorOutputReorderCanvas.pause();
    }
};

const startUserInteraction = () => {
    if (motorOutputReorderCanvas) {
        motorOutputReorderCanvas.startOver();
    } else {
        // Initialize canvas
        const $canvas = window.$(canvasRef.value);
        motorOutputReorderCanvas = new MotorOutputReorderCanvas(
            $canvas,
            props.droneConfiguration,
            onMotorClick,
            spinMotorCallback,
        );
    }

    startMotorJerking(0);
};

// Button handlers
const onStartButtonClicked = async () => {
    actionHintText.value = window.i18n.getMessage("motorOutputReorderDialogSelectSpinningMotor");
    showMainContent.value = true;
    // Wait for DOM to update and canvas to be rendered
    await nextTick();
    startUserInteraction();
};

const startOver = () => {
    showSaveButtons.value = false;
    actionHintText.value = window.i18n.getMessage("motorOutputReorderDialogSelectSpinningMotor");
    startUserInteraction();
};

const save = () => {
    fcStore.motorOutputOrder = Array.from(newMotorOutputReorder);

    MSP.send_message(
        MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING,
        mspHelper.crunch(MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING),
        false,
        () => mspHelper.writeConfiguration(true),
    );

    close();
};

// Dialog methods
const show = () => {
    if (dialogRef.value) {
        dialogRef.value.showModal();
    }
};

const close = () => {
    cleanup();
    if (dialogRef.value) {
        dialogRef.value.close();
    }
    emit("close");
};

const cleanup = () => {
    stopAnyMotorJerking();
    stopMotor();
    stopUserInteraction();

    // Reset state
    safetyAgreed.value = false;
    showMainContent.value = false;
    showSaveButtons.value = false;
    actionHintText.value = "";

    currentJerkingMotor = -1;
    currentSpinningMotor = -1;
    newMotorOutputReorder = [];
};

// Handle ESC key and emergency stop on any key
const handleKeyDown = (e) => {
    // Only handle keydown when dialog is open
    if (!dialogRef.value?.open) return;

    if (e.key === "Escape") {
        close();
    } else if (showMainContent.value && !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        // Emergency stop on any non-navigation key
        cleanup();
    }
};

// Handle dialog cancel (backdrop click, ESC)
const handleCancel = (e) => {
    e.preventDefault();
    cleanup();
    close();
};

// Lifecycle
onMounted(async () => {
    initializeConfig();

    // Initialize switchery for the checkbox
    await nextTick();
    GUI.switchery();

    document.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
    cleanup();
    document.removeEventListener("keydown", handleKeyDown);
});

// Expose methods
defineExpose({
    show,
    close,
});
</script>

<style scoped>
@import "@/components/MotorOutputReordering/Styles.css";

.motorOutputReordering-dialog {
    width: 90%;
    max-width: 900px;
    max-height: 90vh;
    border: 2px solid #4d4d4d;
    border-radius: 3px;
    background-color: rgba(40, 40, 40, 0.97); /* More opaque background */
    color: var(--defaultText);
    padding: 20px;
    overflow-y: auto;
}

.motorOutputReordering-dialog::backdrop {
    background-color: rgba(0, 0, 0, 0.7); /* Slightly more opaque backdrop */
}

.componentContent {
    margin-top: 15px;
}

.buttons {
    margin-top: 20px;
    text-align: center;
}

.regular-button {
    margin: 5px;
    cursor: pointer;
}

.regular-button.left {
    margin-right: 10px;
}
</style>
