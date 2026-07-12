<template>
    <ul class="flex gap-4">
        <li>
            <UTooltip :text="$t('sensorStatusGyro')">
                <UIcon
                    name="i-lucide-rotate-3d"
                    class="size-4"
                    :class="setGyroActive ? 'text-primary' : 'text-muted'"
                />
            </UTooltip>
        </li>
        <li>
            <UTooltip :text="$t('sensorStatusAccel')">
                <UIcon name="i-lucide-move-3d" class="size-4" :class="setAccActive ? 'text-primary' : 'text-muted'" />
            </UTooltip>
        </li>
        <li>
            <UTooltip :text="$t('sensorStatusMag')">
                <UIcon name="i-lucide-compass" class="size-4" :class="setMagActive ? 'text-primary' : 'text-muted'" />
            </UTooltip>
        </li>
        <li>
            <UTooltip :text="$t('sensorStatusBaro')">
                <UIcon
                    name="i-lucide-thermometer"
                    class="size-4"
                    :class="setBaroActive ? 'text-primary' : 'text-muted'"
                />
            </UTooltip>
        </li>
        <li>
            <UTooltip :text="$t('sensorStatusGPS')">
                <UIcon name="i-lucide-satellite" class="size-4" :class="gpsColor" />
            </UTooltip>
        </li>
        <li>
            <UTooltip :text="$t('sensorStatusSonar')">
                <UIcon name="i-lucide-ruler" class="size-4" :class="setSonarActive ? 'text-primary' : 'text-muted'" />
            </UTooltip>
        </li>
    </ul>
</template>

<script setup>
import { computed } from "vue";
import { have_sensor } from "../../js/sensor_helpers";

const props = defineProps({
    sensorsDetected: { type: Number, default: 0 },
    gpsFixState: { type: Number, default: 0 },
});

const setAccActive = computed(() => have_sensor(props.sensorsDetected, "acc"));
const setGyroActive = computed(() => have_sensor(props.sensorsDetected, "gyro"));
const setBaroActive = computed(() => have_sensor(props.sensorsDetected, "baro"));
const setMagActive = computed(() => have_sensor(props.sensorsDetected, "mag"));
const setSonarActive = computed(() => have_sensor(props.sensorsDetected, "sonar"));
const gpsDetected = computed(() => have_sensor(props.sensorsDetected, "gps"));
const hasFix = computed(() => props.gpsFixState > 0);
const gpsOn = computed(() => gpsDetected.value || hasFix.value);
const gpsActiveNoFix = computed(() => gpsOn.value && gpsDetected.value && !hasFix.value);
const gpsActiveWithFix = computed(() => gpsOn.value && gpsDetected.value && hasFix.value);

const gpsColor = computed(() => {
    if (gpsActiveNoFix.value) {
        return "text-error";
    }
    if (gpsActiveWithFix.value) {
        return "text-primary";
    }
    return "text-muted";
});
</script>
