<template>
    <Dialog v-model="showEditorDialog" :title="editMode ? $t('flightPlanEditWaypoint') : $t('flightPlanAddWaypoint')">
        <form ref="formElement" class="editor-form flex flex-col gap-3" @submit.prevent="handleSave">
            <SettingRow :label="$t('flightPlanType')" fullWidth>
                <!-- content z must clear the Dialog overlay/content (z-3000/3001) or the
                     teleported option list renders behind the modal and can't be clicked. -->
                <USelect
                    v-model="form.type"
                    :items="typeItems"
                    :aria-label="$t('flightPlanType')"
                    class="w-48"
                    :ui="{ content: 'z-3002' }"
                />
            </SettingRow>

            <SettingRow v-if="showPosition" :label="$t('flightPlanLatitude')" fullWidth>
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

            <SettingRow v-if="showPosition" :label="$t('flightPlanLongitude')" fullWidth>
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

            <SettingRow v-if="showAltitude" :label="altitudeLabel" fullWidth>
                <UInputNumber
                    v-model="form.altitude"
                    :step="1"
                    :min="0"
                    :max="maxAltitude"
                    required
                    :aria-label="altitudeAriaLabel"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow v-if="showSpeed" :label="speedLabel" fullWidth>
                <UInputNumber
                    v-model="form.speed"
                    :step="0.1"
                    :min="0"
                    :max="maxSpeed"
                    required
                    :aria-label="speedAriaLabel"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow v-if="showYawRate" :label="$t('flightPlanYawRate')" fullWidth>
                <UInputNumber
                    v-model="form.speed"
                    :step="1"
                    :min="0"
                    :max="720"
                    required
                    :aria-label="$t('flightPlanYawRateAria')"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow v-if="showDuration" :label="durationLabel" fullWidth>
                <UInputNumber
                    v-model="form.duration"
                    :step="0.1"
                    :min="0"
                    :max="60"
                    :aria-label="durationAriaLabel"
                    class="w-48"
                />
            </SettingRow>

            <SettingRow v-if="form.type === 'hold'" :label="$t('flightPlanPattern')" fullWidth>
                <USelect
                    v-model="form.pattern"
                    :items="patternItems"
                    :aria-label="$t('flightPlanPattern')"
                    class="w-48"
                    :ui="{ content: 'z-3002' }"
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

<script setup lang="ts">
import { reactive, computed, watch, ref } from "vue";
import { useTranslation } from "i18next-vue";
import Dialog from "@/components/elements/Dialog.vue";
import SettingRow from "@/components/elements/SettingRow.vue";
import { useFlightPlan, type Waypoint } from "@/composables/useFlightPlan";
import { useFlightPlanUnits } from "@/composables/useFlightPlanUnits";

const { t } = useTranslation();
const {
    editingWaypointUid,
    editingWaypoint,
    showEditorDialog,
    addWaypoint,
    updateWaypoint,
    cancelEdit,
    isModifierWaypointType,
} = useFlightPlan();
const { altitudeUnit, speedUnit, altitudeToDisplay, altitudeFromDisplay, speedToDisplay, speedFromDisplay } =
    useFlightPlanUnits();

// Defaults and limits are defined in feet / knots (the stored units) and shown in the selected unit.
const DEFAULT_ALTITUDE_FT = 400;
const DEFAULT_SPEED_KTS = 10;
const MAX_ALTITUDE_FT = 50000;
const MAX_SPEED_KTS = 500;

// Form element ref for validation
const formElement = ref<HTMLFormElement | null>(null);

// Timeout ID for delayed reset to prevent race conditions on quick reopen
let closeResetTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Form altitude/speed hold display-unit values (yaw_rate keeps deg/s in the speed slot).
const roundAltitude = (feet: number) => Math.round(altitudeToDisplay(feet));
const roundSpeed = (knots: number) => Number(speedToDisplay(knots).toFixed(1));

// Form state
const form = reactive({
    latitude: 0,
    longitude: 0,
    altitude: roundAltitude(DEFAULT_ALTITUDE_FT),
    speed: roundSpeed(DEFAULT_SPEED_KTS),
    type: "flyover",
    duration: 1,
    pattern: "circle",
});

// The waypoint being edited, as loaded. If the user leaves altitude/speed untouched we save the
// stored value as-is instead of the rounded display value, so opening and saving never drifts it.
let loadedWaypoint: Waypoint | null = null;

// Unit strings are fixed literals ("ft", "km/h"…); skip escaping so "km/h" isn't rendered as "km&#x2F;h".
const withUnit = (key: string, unit: string) => t(key, { unit, interpolation: { escapeValue: false } });
const altitudeLabel = computed(() => withUnit("flightPlanAltitudeWithUnit", altitudeUnit.value));
const altitudeAriaLabel = computed(() => withUnit("flightPlanAltitudeAria", altitudeUnit.value));
const speedLabel = computed(() => withUnit("flightPlanSpeedWithUnit", speedUnit.value));
const speedAriaLabel = computed(() => withUnit("flightPlanSpeedAria", speedUnit.value));
const maxAltitude = computed(() => roundAltitude(MAX_ALTITUDE_FT));
const maxSpeed = computed(() => roundSpeed(MAX_SPEED_KTS));

// Check if we're in edit mode
const editMode = computed(() => editingWaypointUid.value !== null);

const typeItems = computed(() => [
    { label: t("flightPlanTypeFlyover"), value: "flyover" },
    { label: t("flightPlanTypeFlyby"), value: "flyby" },
    { label: t("flightPlanTypeHold"), value: "hold" },
    { label: t("flightPlanTypeLand"), value: "land" },
    { label: t("flightPlanTypeTakeoff"), value: "takeoff" },
    { label: t("flightPlanTypeAltChange"), value: "alt_change" },
    { label: t("flightPlanTypeDelay"), value: "delay" },
    { label: t("flightPlanTypeYawRate"), value: "yaw_rate" },
]);

const patternItems = computed(() => [
    { label: t("flightPlanPatternCircle"), value: "circle" },
    { label: t("flightPlanPatternFigure8"), value: "figure8" },
    { label: t("flightPlanPatternOrbit"), value: "orbit" },
]);

// Field visibility per waypoint type. Modifier types ignore lat/lon, and each
// modifier uses just one storage slot (alt, duration or speed-as-deg/s).
const isModifier = computed(() => isModifierWaypointType(form.type));
const showPosition = computed(() => !isModifier.value);
const showAltitude = computed(() => !isModifier.value || form.type === "alt_change");
const showSpeed = computed(() => !isModifier.value);
const showYawRate = computed(() => form.type === "yaw_rate");
const showDuration = computed(() => form.type === "hold" || form.type === "delay");
const durationLabel = computed(() => (form.type === "delay" ? t("flightPlanDelayDuration") : t("flightPlanDuration")));
// Aria labels avoid the `<span class="units">` markup that the visual labels carry.
const durationAriaLabel = computed(() =>
    form.type === "delay" ? t("flightPlanDelayDurationAria") : t("flightPlanDurationAria"),
);

// Watch for editing waypoint changes and populate form
watch(editingWaypoint, (waypoint) => {
    if (waypoint) {
        form.latitude = Number(waypoint.latitude.toFixed(6));
        form.longitude = Number(waypoint.longitude.toFixed(6));
        loadedWaypoint = { ...waypoint };
        form.altitude = roundAltitude(waypoint.altitude);
        form.speed = waypoint.type === "yaw_rate" ? waypoint.speed : roundSpeed(waypoint.speed);
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

// Display-unit form values → stored feet / knots.
const altitudeForSave = () => {
    if (loadedWaypoint && form.altitude === roundAltitude(loadedWaypoint.altitude)) {
        return loadedWaypoint.altitude;
    }
    return altitudeFromDisplay(form.altitude);
};

const speedForSave = () => {
    if (loadedWaypoint && loadedWaypoint.type !== "yaw_rate" && form.speed === roundSpeed(loadedWaypoint.speed)) {
        return loadedWaypoint.speed;
    }
    return speedFromDisplay(form.speed);
};

// Build a save payload, zeroing slots that aren't meaningful for the type so
// modifier waypoints don't leak stale form values into CLI/FC round-trips.
const buildPayload = () => {
    const base = { type: form.type, latitude: 0, longitude: 0, altitude: 0, speed: 0, duration: 0, pattern: "circle" };
    switch (form.type) {
        case "alt_change":
            return { ...base, altitude: altitudeForSave() };
        case "delay":
            return { ...base, duration: form.duration };
        case "yaw_rate":
            return { ...base, speed: form.speed };
        case "hold":
            return {
                ...base,
                latitude: form.latitude,
                longitude: form.longitude,
                altitude: altitudeForSave(),
                speed: speedForSave(),
                duration: form.duration,
                pattern: form.pattern,
            };
        default:
            return {
                ...base,
                latitude: form.latitude,
                longitude: form.longitude,
                altitude: altitudeForSave(),
                speed: speedForSave(),
            };
    }
};

// Reset form to defaults
const resetForm = () => {
    form.latitude = 0;
    form.longitude = 0;
    loadedWaypoint = null;
    form.altitude = roundAltitude(DEFAULT_ALTITUDE_FT);
    form.speed = roundSpeed(DEFAULT_SPEED_KTS);
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

    // Each modifier type uses just one storage slot; zero the rest so the CLI
    // round-trip and FC executor only see meaningful values for that type.
    const payload = buildPayload();

    const success = editMode.value ? updateWaypoint(editingWaypointUid.value, payload) : addWaypoint(payload);

    if (success) {
        resetForm();
        showEditorDialog.value = false;
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
