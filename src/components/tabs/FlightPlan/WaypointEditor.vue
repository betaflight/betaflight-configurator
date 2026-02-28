<template>
    <Dialog v-model="showEditorDialog" :title="editMode ? $t('flightPlanEditWaypoint') : $t('flightPlanAddWaypoint')">
        <form ref="formElement" @submit.prevent="handleSave">
            <!-- Latitude -->
            <div class="form-row">
                <div class="input-column">
                    <input
                        type="number"
                        v-model.number="form.latitude"
                        step="0.000001"
                        min="-90"
                        max="90"
                        required
                        :aria-label="$t('flightPlanLatitude')"
                    />
                </div>
                <div class="label-column" v-html="$t('flightPlanLatitude')"></div>
                <div class="separator"></div>
                <div class="extra-column-1"></div>
                <div class="extra-column-2"></div>
            </div>

            <!-- Longitude -->
            <div class="form-row">
                <div class="input-column">
                    <input
                        type="number"
                        v-model.number="form.longitude"
                        step="0.000001"
                        min="-180"
                        max="180"
                        required
                        :aria-label="$t('flightPlanLongitude')"
                    />
                </div>
                <div class="label-column" v-html="$t('flightPlanLongitude')"></div>
                <div class="separator"></div>
                <div class="extra-column-1"></div>
                <div class="extra-column-2"></div>
            </div>

            <!-- Altitude -->
            <div class="form-row">
                <div class="input-column">
                    <input
                        type="number"
                        v-model.number="form.altitude"
                        step="1"
                        min="0"
                        max="50000"
                        required
                        :aria-label="$t('flightPlanAltitude')"
                    />
                </div>
                <div class="label-column" v-html="$t('flightPlanAltitude')"></div>
                <div class="separator"></div>
                <div class="extra-column-1"></div>
                <div class="extra-column-2"></div>
            </div>

            <!-- Speed -->
            <div class="form-row">
                <div class="input-column">
                    <input
                        type="number"
                        v-model.number="form.speed"
                        step="0.1"
                        min="0"
                        max="500"
                        required
                        :aria-label="$t('flightPlanSpeed')"
                    />
                </div>
                <div class="label-column" v-html="$t('flightPlanSpeed')"></div>
                <div class="separator"></div>
                <div class="extra-column-1"></div>
                <div class="extra-column-2"></div>
            </div>

            <!-- Type -->
            <div class="form-row">
                <div class="input-column">
                    <select v-model="form.type" :aria-label="$t('flightPlanType')">
                        <option value="flyover">{{ $t("flightPlanTypeFlyover") }}</option>
                        <option value="flyby">{{ $t("flightPlanTypeFlyby") }}</option>
                        <option value="hold">{{ $t("flightPlanTypeHold") }}</option>
                        <option value="land">{{ $t("flightPlanTypeLand") }}</option>
                    </select>
                </div>
                <div class="label-column" v-html="$t('flightPlanType')"></div>
                <div class="separator"></div>
                <div class="extra-column-1"></div>
                <div class="extra-column-2"></div>
            </div>

            <!-- Duration (conditional - only for hold) -->
            <div v-if="form.type === 'hold'" class="form-row">
                <div class="input-column">
                    <input
                        type="number"
                        v-model.number="form.duration"
                        step="0.1"
                        min="0"
                        max="60"
                        :aria-label="$t('flightPlanDuration')"
                    />
                </div>
                <div class="label-column" v-html="$t('flightPlanDuration')"></div>
                <div class="separator"></div>
                <div class="extra-column-1"></div>
                <div class="extra-column-2"></div>
            </div>

            <!-- Pattern (conditional - only for hold) -->
            <div v-if="form.type === 'hold'" class="form-row">
                <div class="input-column">
                    <select v-model="form.pattern" :aria-label="$t('flightPlanPattern')">
                        <option value="circle">{{ $t("flightPlanPatternCircle") }}</option>
                        <option value="figure8">{{ $t("flightPlanPatternFigure8") }}</option>
                        <option value="orbit">{{ $t("flightPlanPatternOrbit") }}</option>
                    </select>
                </div>
                <div class="label-column" v-html="$t('flightPlanPattern')"></div>
                <div class="separator"></div>
                <div class="extra-column-1"></div>
                <div class="extra-column-2"></div>
            </div>
        </form>

        <template #footer>
            <div class="buttons">
                <button type="button" @click="handleCancel" class="cancel-btn">
                    {{ $t("cancel") }}
                </button>
                <button type="button" @click="handleSave" class="primary save-btn">
                    {{ editMode ? $t("update") : $t("add") }}
                </button>
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { reactive, computed, watch, ref } from "vue";
import Dialog from "@/components/elements/Dialog.vue";
import { useFlightPlan } from "@/composables/useFlightPlan";

const { editingWaypointUid, editingWaypoint, showEditorDialog, addWaypoint, updateWaypoint, cancelEdit } =
    useFlightPlan();

// Form element ref for validation
const formElement = ref(null);

// Timeout ID for delayed reset to prevent race conditions on quick reopen
let closeResetTimeoutId = null;

// Form state
const form = reactive({
    latitude: 0,
    longitude: 0,
    altitude: 400,
    speed: 10,
    type: "flyover",
    duration: 1,
    pattern: "circle",
});

// Check if we're in edit mode
const editMode = computed(() => editingWaypointUid.value !== null);

// Watch for editing waypoint changes and populate form
watch(editingWaypoint, (waypoint) => {
    if (waypoint) {
        form.latitude = Number(waypoint.latitude.toFixed(6));
        form.longitude = Number(waypoint.longitude.toFixed(6));
        form.altitude = waypoint.altitude;
        form.speed = waypoint.speed;
        form.type = waypoint.type;
        form.duration = waypoint.duration;
        form.pattern = waypoint.pattern;
    }
});

// Watch for dialog state changes
watch(
    () => showEditorDialog.value,
    (isOpen, wasOpen) => {
        if (isOpen) {
            // Dialog opened, clear any pending reset from previous close
            if (closeResetTimeoutId !== null) {
                clearTimeout(closeResetTimeoutId);
                closeResetTimeoutId = null;
            }
            // Reset form to defaults if opening in add mode
            if (!editingWaypointUid.value) {
                resetForm();
            }
        } else if (!isOpen && wasOpen) {
            // Dialog closed, clear any existing timeout before scheduling new one
            if (closeResetTimeoutId !== null) {
                clearTimeout(closeResetTimeoutId);
            }
            // Clean up state after a delay to avoid title flicker during close animation
            closeResetTimeoutId = setTimeout(() => {
                resetForm();
                if (editingWaypointUid.value) {
                    cancelEdit();
                }
                closeResetTimeoutId = null;
            }, 200);
        }
    },
);

// Reset form to defaults
const resetForm = () => {
    form.latitude = 0;
    form.longitude = 0;
    form.altitude = 400;
    form.speed = 10;
    form.type = "flyover";
    form.duration = 1;
    form.pattern = "circle";
};

// Handle save
const handleSave = () => {
    // Perform HTML5 validation before saving
    if (!formElement.value?.reportValidity()) {
        // Validation failed, browser will show validation messages
        return;
    }

    if (editMode.value) {
        // Update existing waypoint
        const success = updateWaypoint(editingWaypointUid.value, {
            latitude: form.latitude,
            longitude: form.longitude,
            altitude: form.altitude,
            speed: form.speed,
            type: form.type,
            duration: form.duration,
            pattern: form.pattern,
        });
        if (success) {
            resetForm();
            showEditorDialog.value = false;
        }
    } else {
        // Add new waypoint
        const success = addWaypoint({
            latitude: form.latitude,
            longitude: form.longitude,
            altitude: form.altitude,
            speed: form.speed,
            type: form.type,
            duration: form.duration,
            pattern: form.pattern,
        });
        if (success) {
            resetForm();
            showEditorDialog.value = false;
        }
    }
};

// Handle cancel
const handleCancel = () => {
    // Just close the dialog - the watch will handle cleanup
    showEditorDialog.value = false;
};
</script>

<style scoped>
form {
    min-width: 600px;
}

.form-row {
    display: grid;
    grid-template-columns: 0.575fr 2fr auto 1fr 1fr;
    gap: 1rem;
    margin-bottom: 0.75rem;
    align-items: center;
}

.separator {
    width: 1px;
    height: 100%;
    background: var(--surface-400);
    opacity: 0.3;
    margin: 0 0.5rem;
}

.extra-column-1,
.extra-column-2 {
    /* Placeholder for future options */
}

.input-column input,
.input-column select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--surface-500);
    border-radius: 4px;
    background: var(--surface-50);
    color: var(--text);
    font-size: 0.9rem;
}

.input-column input:focus,
.input-column select:focus {
    outline: none;
    border-color: var(--primary-500);
}

.label-column {
    text-align: left;
    color: var(--text);
    font-size: 0.9rem;
}

.number,
.select {
    margin-bottom: 0.5rem;
}

.buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
}

.buttons button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--surface-500);
    background: var(--surface-200);
    color: var(--text);
    cursor: pointer;
    transition: background 0.2s;
}

.buttons button:hover {
    background: var(--surface-300);
}

.save-btn.primary {
    background: var(--primary-500);
    color: var(--surface-50);
    border-color: var(--primary-500);
}

.save-btn.primary:hover {
    background: var(--primary-600);
    border-color: var(--primary-600);
}

.cancel-btn:hover {
    background: var(--surface-400);
}
</style>
