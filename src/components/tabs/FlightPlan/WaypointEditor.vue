<template>
    <Dialog v-model="showEditorDialog" :title="editMode ? $t('flightPlanEditWaypoint') : $t('flightPlanAddWaypoint')">
        <form ref="formElement" class="editor-form flex flex-col gap-3" @submit.prevent="handleSave">
            <SettingRow :label="$t('flightPlanLatitude')" full-width>
                <UInputNumber
                    v-model="form.latitude"
                    :step="0.000001"
                    :min="-90"
                    :max="90"
                    required
                    :aria-label="$t('flightPlanLatitude')"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow :label="$t('flightPlanLongitude')" full-width>
                <UInputNumber
                    v-model="form.longitude"
                    :step="0.000001"
                    :min="-180"
                    :max="180"
                    required
                    :aria-label="$t('flightPlanLongitude')"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow :label="$t('flightPlanAltitude')" full-width>
                <UInputNumber
                    v-model="form.altitude"
                    :step="1"
                    :min="0"
                    :max="50000"
                    required
                    :aria-label="$t('flightPlanAltitude')"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow :label="$t('flightPlanSpeed')" full-width>
                <UInputNumber
                    v-model="form.speed"
                    :step="0.1"
                    :min="0"
                    :max="500"
                    required
                    :aria-label="$t('flightPlanSpeed')"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow :label="$t('flightPlanType')" full-width>
                <USelect v-model="form.type" :items="typeItems" :aria-label="$t('flightPlanType')" class="w-48" />
            </SettingRow>

            <SettingRow v-if="form.type === 'hold'" :label="$t('flightPlanDuration')" full-width>
                <UInputNumber
                    v-model="form.duration"
                    :step="0.1"
                    :min="0"
                    :max="60"
                    :aria-label="$t('flightPlanDuration')"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow v-if="form.type === 'hold'" :label="$t('flightPlanPattern')" full-width>
                <USelect
                    v-model="form.pattern"
                    :items="patternItems"
                    :aria-label="$t('flightPlanPattern')"
                    class="w-48"
                />
            </SettingRow>
        </form>

        <template #footer>
            <div class="flex gap-2 justify-end">
                <UButton variant="soft" color="neutral" @click="handleCancel">
                    {{ $t("cancel") }}
                </UButton>
                <UButton color="primary" @click="handleSave">
                    {{ editMode ? $t("update") : $t("add") }}
                </UButton>
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { reactive, computed, watch, ref } from "vue";
import { useTranslation } from "i18next-vue";
import Dialog from "@/components/elements/Dialog.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import { useFlightPlan } from "@/composables/useFlightPlan";

const { t } = useTranslation();
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

const typeItems = computed(() => [
    { label: t("flightPlanTypeFlyover"), value: "flyover" },
    { label: t("flightPlanTypeFlyby"), value: "flyby" },
    { label: t("flightPlanTypeHold"), value: "hold" },
    { label: t("flightPlanTypeLand"), value: "land" },
]);

const patternItems = computed(() => [
    { label: t("flightPlanPatternCircle"), value: "circle" },
    { label: t("flightPlanPatternFigure8"), value: "figure8" },
    { label: t("flightPlanPatternOrbit"), value: "orbit" },
]);

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
.editor-form {
    min-width: 400px;
}
</style>
