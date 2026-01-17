<template>
    <dialog ref="dialogRef" class="escDshotDirection-dialog">
        <div class="escDshotDirection-Component">
            <h3 class="escDshotDirection-ComponentHeader" v-html="i18nMessage('escDshotDirectionDialog-Title')"></h3>

            <!-- Configuration Errors -->
            <div v-if="hasConfigErrors" class="componentContent" id="escDshotDirectionDialog-ConfigErrors">
                <div
                    v-if="!escProtocolIsDshot"
                    class="escDshotDirectionErrorTextBlock"
                    v-html="i18nMessage('escDshotDirectionDialog-WrongProtocolText')"
                ></div>
                <div
                    v-if="numberOfMotors <= 0"
                    class="escDshotDirectionErrorTextBlock"
                    v-html="i18nMessage('escDshotDirectionDialog-WrongMixerText')"
                ></div>
            </div>

            <!-- Main Content -->
            <div
                v-if="!hasConfigErrors && showMainContent"
                class="componentContent"
                id="escDshotDirectionDialog-MainContent"
            >
                <div id="escDshotDirectionDialog-MixerPreview" class="grey">
                    <img id="escDshotDirectionDialog-MixerPreviewImg" :src="mixerPreviewSrc" alt="Mixer Preview" />
                </div>

                <!-- Normal Mode -->
                <div v-if="!wizardMode" id="escDshotDirectionDialog-NormalDialog" class="display-contents">
                    <h4
                        id="escDshotDirectionDialog-ActionHint"
                        :class="{ 'red-text': motorIsSpinning }"
                        v-html="actionHintText"
                    ></h4>
                    <h4 v-html="i18nMessage('escDshotDirectionDialog-SelectMotorSafety')"></h4>

                    <div id="escDshotDirectionDialog-SelectMotorButtonsWrapper">
                        <a
                            v-for="(motor, index) in motorButtons"
                            :key="index"
                            href="#"
                            class="regular-button"
                            :class="{
                                pushed: index !== selectedMotor,
                                highlighted: currentSpinningButton === index,
                            }"
                            @mousedown="onMotorButtonDown(index)"
                            @mouseup="onMotorButtonUp(index)"
                            @mouseout="onMotorButtonUp(index)"
                            @click.prevent
                        >
                            {{ motor }}
                        </a>
                    </div>

                    <div
                        v-if="showSecondAction"
                        id="escDshotDirectionDialog-SecondActionBlock"
                        class="display-contents"
                    >
                        <h4
                            id="escDshotDirectionDialog-SecondHint"
                            :class="{ 'red-text': motorIsSpinning }"
                            v-html="secondHintText"
                        ></h4>
                        <h4 v-html="i18nMessage('escDshotDirectionDialog-SetDirectionHintSafety')"></h4>

                        <div id="escDshotDirectionDialog-CommandsWrapper">
                            <a
                                href="#"
                                class="regular-button"
                                :class="{ highlighted: spinningDirection === 'normal' }"
                                @mousedown="onDirectionButtonDown('normal')"
                                @mouseup="onDirectionButtonUp"
                                @mouseout="onDirectionButtonUp"
                                @click.prevent
                            >
                                {{ normalButtonText }}
                            </a>
                            <a
                                href="#"
                                class="regular-button"
                                :class="{ highlighted: spinningDirection === 'reverse' }"
                                @mousedown="onDirectionButtonDown('reverse')"
                                @mouseup="onDirectionButtonUp"
                                @mouseout="onDirectionButtonUp"
                                @click.prevent
                            >
                                {{ reverseButtonText }}
                            </a>
                        </div>
                        <h4 v-html="i18nMessage('escDshotDirectionDialog-SettingsAutoSaved')"></h4>
                    </div>
                </div>

                <!-- Wizard Mode -->
                <div v-if="wizardMode" id="escDshotDirectionDialog-WizardDialog" class="display-contents">
                    <a
                        v-if="!wizardSpinning"
                        href="#"
                        class="regular-button"
                        @click.prevent="onSpinWizardClick"
                        v-html="i18nMessage('escDshotDirectionDialog-SpinWizard')"
                    ></a>

                    <div v-if="wizardSpinning" id="escDshotDirectionDialog-SpinningWizard" class="display-contents">
                        <h4 v-html="i18nMessage('escDshotDirectionDialog-WizardActionHint')"></h4>
                        <h4 v-html="i18nMessage('escDshotDirectionDialog-WizardActionHintSecondLine')"></h4>

                        <div id="escDshotDirectionDialog-WizardMotorButtons">
                            <a
                                v-for="(motor, index) in wizardMotorButtons"
                                :key="index"
                                href="#"
                                class="regular-button"
                                :class="{ pushed: wizardMotorDirections[index] }"
                                @click.prevent="onWizardMotorClick(index)"
                            >
                                {{ motor }}
                            </a>
                        </div>

                        <a
                            href="#"
                            class="regular-button"
                            @click.prevent="onStopWizardClick"
                            v-html="i18nMessage('escDshotDirectionDialog-StopWizard')"
                        ></a>
                        <h4 v-html="i18nMessage('escDshotDirectionDialog-SettingsAutoSaved')"></h4>
                    </div>
                </div>
            </div>

            <!-- Warning/Start Screen -->
            <div
                v-if="!hasConfigErrors && !showMainContent"
                class="componentContent"
                id="escDshotDirectionDialog-Warning"
            >
                <div>
                    <p
                        class="escDshotDirectionDialog-RiskNoticeText"
                        v-html="i18nMessage('escDshotDirectionDialog-RiskNotice')"
                    ></p>
                    <div class="escDshotDirectionToggleParentContainer">
                        <div class="escDshotDirectionToggleNarrow">
                            <input
                                id="escDshotDirectionDialog-safetyCheckbox"
                                type="checkbox"
                                class="toggle"
                                v-model="safetyAgreed"
                            />
                        </div>
                        <div class="escDshotDirectionDialog-ToggleWide">
                            <span
                                class="motorsEnableTestMode escDshotDirectionDialog-RiskNoticeText"
                                v-html="i18nMessage('escDshotDirectionDialog-UnderstandRisks')"
                            ></span>
                        </div>
                    </div>
                    <div
                        class="escDshotDirectionDialog-InformationNotice"
                        v-html="i18nMessage('escDshotDirectionDialog-InformationNotice')"
                    ></div>

                    <div
                        v-if="safetyAgreed"
                        id="escDshotDirectionDialog-StartWizardBlock"
                        class="escDshotDirectionDialog-StartBlock"
                    >
                        <div class="escDshotDirectionDialog-Buttons">
                            <a
                                href="#"
                                class="regular-button escDshotDirectionDialog-StartButton"
                                @click.prevent="startWizardMode"
                                v-html="i18nMessage('escDshotDirectionDialog-StartWizard')"
                            ></a>
                        </div>
                        <div
                            class="escDshotDirectionDialog-Description"
                            v-html="i18nMessage('escDshotDirectionDialog-WizardInformationNotice')"
                        ></div>
                    </div>

                    <div
                        v-if="safetyAgreed"
                        id="escDshotDirectionDialog-StartNormalBlock"
                        class="escDshotDirectionDialog-StartBlock"
                    >
                        <div class="escDshotDirectionDialog-Buttons">
                            <a
                                href="#"
                                class="regular-button escDshotDirectionDialog-StartButton"
                                @click.prevent="startNormalMode"
                                v-html="i18nMessage('escDshotDirectionDialog-Start')"
                            ></a>
                        </div>
                        <div
                            class="escDshotDirectionDialog-Description"
                            v-html="i18nMessage('escDshotDirectionDialog-NormalInformationNotice')"
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    </dialog>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useFlightControllerStore } from "@/stores/fc";
import { getMixerImageSrc } from "@/js/utils/common";
import EscDshotDirectionMotorDriver from "@/components/EscDshotDirection/EscDshotDirectionMotorDriver";
import DshotCommand from "@/js/utils/DshotCommand";
import GUI from "@/js/gui";

const props = defineProps({
    motorConfig: {
        type: Object,
        required: true,
    },
});

const emit = defineEmits(["close"]);

const fcStore = useFlightControllerStore();
const dialogRef = ref(null);

// Configuration
const escProtocolIsDshot = computed(() => props.motorConfig.escProtocolIsDshot);
const numberOfMotors = computed(() => props.motorConfig.numberOfMotors);
const hasConfigErrors = computed(() => !escProtocolIsDshot.value || numberOfMotors.value <= 0);

// State
const safetyAgreed = ref(false);
const showMainContent = ref(false);
const wizardMode = ref(false);
const wizardSpinning = ref(false);
const selectedMotor = ref(-1);
const motorIsSpinning = ref(false);
const showSecondAction = ref(false);
const currentSpinningButton = ref(-1);
const spinningDirection = ref(null);
const wizardMotorDirections = ref([]);

// Translation helper
const i18nMessage = (key) => {
    return window.i18n.getMessage(key);
};

// Motor driver
let motorDriver = null;
let directionButtonTimeout = null;
let wizardButtonTimeout = null;

// Constants
const BUTTON_TIMEOUT_MS = 400;
const MOTOR_DRIVER_QUEUE_INTERVAL_MS = 100;
const MOTOR_DRIVER_STOP_MOTORS_PAUSE_MS = 400;
const ALL_MOTORS = DshotCommand.ALL_MOTORS;

// Mixer preview
const mixerPreviewSrc = computed(() => {
    const mixer = fcStore.mixerConfig?.mixer || 1;
    const reverseMotorDir = fcStore.mixerConfig?.reverseMotorDir || false;
    const src = getMixerImageSrc(mixer, reverseMotorDir);
    console.log("Mixer image src:", src, "mixer:", mixer, "reverseMotorDir:", reverseMotorDir);
    return src;
});

// Motor buttons
const motorButtons = computed(() => {
    const buttons = [];
    for (let i = 1; i <= numberOfMotors.value; i++) {
        buttons.push(String(i));
    }
    buttons.push("All");
    return buttons;
});

const wizardMotorButtons = computed(() => {
    const buttons = [];
    for (let i = 1; i <= numberOfMotors.value; i++) {
        buttons.push(String(i));
    }
    return buttons;
});

// Text states
const actionHintText = computed(() => {
    if (motorIsSpinning.value) {
        return window.i18n.getMessage("escDshotDirectionDialog-ReleaseButtonToStop");
    }
    return window.i18n.getMessage("escDshotDirectionDialog-SelectMotor");
});

const secondHintText = computed(() => {
    if (motorIsSpinning.value) {
        return window.i18n.getMessage("escDshotDirectionDialog-ReleaseButtonToStop");
    }
    return window.i18n.getMessage("escDshotDirectionDialog-SetDirectionHint");
});

const normalButtonText = ref(window.i18n.getMessage("escDshotDirectionDialog-CommandNormal"));
const reverseButtonText = ref(window.i18n.getMessage("escDshotDirectionDialog-CommandReverse"));

// Motor button handlers
const onMotorButtonDown = (index) => {
    showSecondAction.value = true;
    motorIsSpinning.value = true;
    currentSpinningButton.value = index;

    const motorIndex = index === motorButtons.value.length - 1 ? ALL_MOTORS : index;
    selectedMotor.value = motorIndex;
    motorDriver.spinMotor(motorIndex);

    clearDirectionButtonTimeout();
    activateDirectionButtons(BUTTON_TIMEOUT_MS);
};

const onMotorButtonUp = (index) => {
    if (motorIsSpinning.value && currentSpinningButton.value === index) {
        motorIsSpinning.value = false;
        currentSpinningButton.value = -1;
        motorDriver.stopAllMotors();

        deactivateDirectionButtons();
        activateDirectionButtons(BUTTON_TIMEOUT_MS);
    }
};

// Direction button handlers
const onDirectionButtonDown = (direction) => {
    if (!motorIsSpinning.value) return;

    const dshotCommand =
        direction === "normal"
            ? DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1
            : DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_2;

    spinningDirection.value = direction;
    motorDriver.setEscSpinDirection(selectedMotor.value, dshotCommand);
    motorDriver.spinMotor(selectedMotor.value);

    if (direction === "normal") {
        normalButtonText.value = window.i18n.getMessage("escDshotDirectionDialog-ReleaseToStop");
    } else {
        reverseButtonText.value = window.i18n.getMessage("escDshotDirectionDialog-ReleaseToStop");
    }
};

const onDirectionButtonUp = () => {
    if (spinningDirection.value) {
        motorDriver.stopAllMotors();
        spinningDirection.value = null;

        normalButtonText.value = window.i18n.getMessage("escDshotDirectionDialog-CommandNormal");
        reverseButtonText.value = window.i18n.getMessage("escDshotDirectionDialog-CommandReverse");

        deactivateDirectionButtons();
        activateDirectionButtons(BUTTON_TIMEOUT_MS);
    }
};

const activateDirectionButtons = (timeoutMs) => {
    // Direction buttons are always active in Vue, just add a small delay to prevent accidental double-clicks
    directionButtonTimeout = setTimeout(() => {
        // Ready to accept input
    }, timeoutMs);
};

const deactivateDirectionButtons = () => {
    if (directionButtonTimeout) {
        clearTimeout(directionButtonTimeout);
        directionButtonTimeout = null;
    }
};

const clearDirectionButtonTimeout = () => {
    if (directionButtonTimeout) {
        clearTimeout(directionButtonTimeout);
    }
};

// Wizard mode handlers
const onSpinWizardClick = () => {
    wizardSpinning.value = true;
    wizardMotorDirections.value = Array(numberOfMotors.value).fill(false);

    motorDriver.setEscSpinDirection(ALL_MOTORS, DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1);
    motorDriver.spinAllMotors();

    activateWizardButtons(0);
};

const onStopWizardClick = () => {
    wizardSpinning.value = false;
    motorDriver.stopAllMotorsNow();
    deactivateWizardButtons();
};

const onWizardMotorClick = (index) => {
    deactivateWizardButtons();

    const isReversed = wizardMotorDirections.value[index];
    const direction = isReversed
        ? DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1
        : DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_2;

    motorDriver.setEscSpinDirection(index, direction);
    wizardMotorDirections.value[index] = !isReversed;

    activateWizardButtons(BUTTON_TIMEOUT_MS);
};

const activateWizardButtons = (timeoutMs) => {
    wizardButtonTimeout = setTimeout(() => {
        // Ready to accept input
    }, timeoutMs);
};

const deactivateWizardButtons = () => {
    if (wizardButtonTimeout) {
        clearTimeout(wizardButtonTimeout);
        wizardButtonTimeout = null;
    }
};

// Mode starters
const startNormalMode = () => {
    showMainContent.value = true;
    wizardMode.value = false;
    motorDriver.activate();
};

const startWizardMode = () => {
    showMainContent.value = true;
    wizardMode.value = true;
    wizardSpinning.value = false;
    motorDriver.activate();
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
    if (motorDriver) {
        motorDriver.stopAllMotorsNow();
        motorDriver.deactivate();
    }

    clearDirectionButtonTimeout();
    deactivateDirectionButtons();
    deactivateWizardButtons();

    // Reset state
    safetyAgreed.value = false;
    showMainContent.value = false;
    wizardMode.value = false;
    wizardSpinning.value = false;
    selectedMotor.value = -1;
    motorIsSpinning.value = false;
    showSecondAction.value = false;
    currentSpinningButton.value = -1;
    spinningDirection.value = null;
};

// Handle ESC key
const handleKeyDown = (e) => {
    if (e.key === "Escape") {
        close();
    }
};

// Lifecycle
onMounted(async () => {
    // Initialize motor driver
    motorDriver = new EscDshotDirectionMotorDriver(
        props.motorConfig,
        MOTOR_DRIVER_QUEUE_INTERVAL_MS,
        MOTOR_DRIVER_STOP_MOTORS_PAUSE_MS,
    );

    // Initialize switchery for the checkbox
    await nextTick();
    GUI.switchery();

    document.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
    cleanup();
    document.removeEventListener("keydown", handleKeyDown);
});

// Expose show method
defineExpose({
    show,
    close,
});
</script>

<style scoped>
@import "@/components/EscDshotDirection/Styles.css";

.escDshotDirection-dialog {
    width: 90%;
    max-width: 800px;
    max-height: 90vh;
    border: 2px solid #4d4d4d;
    border-radius: 3px;
    background-color: var(--boxBackground);
    color: var(--defaultText);
    padding: 20px;
    overflow-y: auto;
}

.escDshotDirection-dialog::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
}

.display-contents {
    display: contents;
}

.red-text {
    color: #e60000;
}

.regular-button {
    margin: 5px;
    cursor: pointer;
}

.regular-button.pushed {
    opacity: 0.5;
}

.regular-button.highlighted {
    background-color: rgba(255, 187, 0, 0.6);
}

.componentContent {
    margin-top: 15px;
}

.escDshotDirectionErrorTextBlock {
    color: #e60000;
    font-weight: bold;
    margin: 10px 0;
}

#escDshotDirectionDialog-SelectMotorButtonsWrapper,
#escDshotDirectionDialog-CommandsWrapper,
#escDshotDirectionDialog-WizardMotorButtons {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 15px 0;
}

#escDshotDirectionDialog-MixerPreview {
    width: 100%;
    padding-top: 8px;
    padding-bottom: 9px;
    margin-bottom: 8px;
}

#escDshotDirectionDialog-MixerPreviewImg {
    display: block;
    width: 160px;
    height: 160px;
    margin-left: auto;
    margin-right: auto;
    margin-top: auto;
    margin-bottom: auto;
}

.grey {
    background-color: #828885;
    border: 1px solid #4d4d4d;
}
</style>
