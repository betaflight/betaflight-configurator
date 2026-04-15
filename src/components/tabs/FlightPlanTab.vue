<template>
    <BaseTab tab-name="flight_plan">
        <div class="content_wrapper">
            <!-- Title and Documentation -->
            <div class="cf_column">
                <div class="tab_title" v-html="$t('tabFlightPlan')"></div>
                <WikiButton docUrl="flight-plan" />
            </div>

            <!-- Two-column layout -->
            <div class="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-4">
                <!-- Left Column: Map Display and Elevation Profile -->
                <div class="flex flex-col gap-4">
                    <FlightPlanMap />
                    <ElevationProfile />
                </div>

                <!-- Right Column: Flight Plan List -->
                <div class="flex flex-col">
                    <WaypointList />
                </div>
            </div>
        </div>

        <!-- Waypoint Editor Dialog -->
        <WaypointEditor />

        <!-- Clear Confirmation Dialog -->
        <Dialog v-model="showClearDialog" :title="$t('flightPlanClearTitle')">
            <p v-html="$t('flightPlanConfirmClear')"></p>

            <template #footer>
                <div class="flex gap-2 justify-end">
                    <UButton variant="soft" color="neutral" @click="showClearDialog = false">
                        {{ $t("cancel") }}
                    </UButton>
                    <UButton color="error" @click="confirmClear">
                        {{ $t("flightPlanClear") }}
                    </UButton>
                </div>
            </template>
        </Dialog>

        <!-- Bottom toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom flex items-center gap-2">
            <UButton variant="soft" color="error" @click="handleClear">
                {{ $t("flightPlanClear") }}
            </UButton>
            <UButton variant="soft" @click="handleLoad">
                {{ $t("flightPlanLoadFromFC") }}
            </UButton>
            <UButton @click="handleSave">
                {{ $t("save") }}
            </UButton>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, onMounted } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import Dialog from "@/components/elements/Dialog.vue";
import WaypointList from "./FlightPlan/WaypointList.vue";
import WaypointEditor from "./FlightPlan/WaypointEditor.vue";
import FlightPlanMap from "./FlightPlan/FlightPlanMap.vue";
import ElevationProfile from "./FlightPlan/ElevationProfile.vue";
import { useFlightPlan } from "@/composables/useFlightPlan";
import GUI from "@/js/gui";
import { gui_log } from "@/js/gui_log";
import { i18n } from "@/js/localization";

const { loadFromFC, saveToFC, clearOnFC, clearPlan, waypoints } = useFlightPlan();
const showClearDialog = ref(false);

onMounted(async () => {
    await loadFromFC();
    GUI.content_ready();
});

const handleSave = async () => {
    await saveToFC();
};

const handleLoad = async () => {
    await loadFromFC();
};

const handleClear = () => {
    if (waypoints.value.length === 0) {
        gui_log(i18n.getMessage("flightPlanNoWaypoints") || "No waypoints to clear");
        return;
    }

    showClearDialog.value = true;
};

const confirmClear = async () => {
    clearPlan();
    await clearOnFC();
    showClearDialog.value = false;
};
</script>

<style scoped>
/* Bottom toolbar (CRITICAL: must be exactly 2rem) */
.content_toolbar.toolbar_fixed_bottom {
    position: fixed;
    bottom: 2rem;
}
</style>
