<template>
    <BaseTab tab-name="flight_plan">
        <div class="content_wrapper">
            <!-- Title and Documentation -->
            <div class="cf_column">
                <div class="tab_title" v-html="$t('tabFlightPlan')"></div>
                <WikiButton docUrl="flight-plan" />
            </div>

            <div class="flex flex-col gap-[25px]">
                <!-- Top row: Map and Waypoint List (stretch to matching heights) -->
                <div class="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-4">
                    <FlightPlanMap />
                    <WaypointList />
                </div>

                <!-- Full-width Elevation Profile -->
                <ElevationProfile />
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

        <!-- Load-from-FC Confirmation Dialog -->
        <Dialog v-model="showLoadPromptDialog" :title="$t('flightPlanLoadPromptTitle')" :closeable="false">
            <p v-html="$t('flightPlanLoadPromptBody')"></p>

            <template #footer>
                <div class="flex gap-2 justify-end">
                    <UButton variant="soft" color="neutral" @click="declineLoadFromFC">
                        {{ $t("flightPlanKeepLocal") }}
                    </UButton>
                    <UButton @click="confirmLoadFromFC">
                        {{ $t("flightPlanLoadFromFC") }}
                    </UButton>
                </div>
            </template>
        </Dialog>

        <!-- Bottom toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom flex items-center gap-2">
            <UButton variant="soft" color="error" @click="handleClear">
                {{ $t("flightPlanClear") }}
            </UButton>
            <UButton variant="soft" :disabled="!canUseFC" :title="$t('flightPlanLoadFromFC')" @click="handleLoad">
                {{ $t("flightPlanLoad") }}
            </UButton>
            <UButton :disabled="!canUseFC" :title="$t('flightPlanSaveToFC')" @click="handleSave">
                {{ $t("save") }}
            </UButton>
        </div>
    </BaseTab>
</template>

<script setup>
import { ref, computed, onMounted } from "vue";
import BaseTab from "./BaseTab.vue";
import WikiButton from "@/components/elements/WikiButton.vue";
import Dialog from "@/components/elements/Dialog.vue";
import WaypointList from "./FlightPlan/WaypointList.vue";
import WaypointEditor from "./FlightPlan/WaypointEditor.vue";
import FlightPlanMap from "./FlightPlan/FlightPlanMap.vue";
import ElevationProfile from "./FlightPlan/ElevationProfile.vue";
import { useFlightPlan } from "@/composables/useFlightPlan";
import { useConnectionStore } from "@/stores/connection";
import FC from "@/js/fc";
import GUI from "@/js/gui";
import { gui_log } from "@/js/gui_log";
import { i18n } from "@/js/localization";

const { loadFromFC, saveToFC, clearOnFC, clearPlan, loadPlan, waypoints } = useFlightPlan();
const connectionStore = useConnectionStore();
const showClearDialog = ref(false);
const showLoadPromptDialog = ref(false);

const isConnected = computed(() => connectionStore.connectionValid);
const fcHasFlightPlan = computed(() => FC.CONFIG?.buildOptions?.includes("USE_FLIGHT_PLAN") ?? false);
const canUseFC = computed(() => isConnected.value && fcHasFlightPlan.value);

onMounted(async () => {
    loadPlan();

    if (canUseFC.value) {
        if (waypoints.value.length === 0) {
            await loadFromFC();
        } else {
            showLoadPromptDialog.value = true;
        }
    }

    GUI.content_ready();
});

const handleSave = async () => {
    if (!canUseFC.value) {
        return;
    }
    await saveToFC();
};

const handleLoad = async () => {
    if (!canUseFC.value) {
        return;
    }
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
    if (canUseFC.value) {
        await clearOnFC();
    }
    showClearDialog.value = false;
};

const confirmLoadFromFC = async () => {
    showLoadPromptDialog.value = false;
    await loadFromFC();
};

const declineLoadFromFC = () => {
    showLoadPromptDialog.value = false;
};
</script>

<style scoped>
/* Bottom toolbar (CRITICAL: must be exactly 2rem) */
.content_toolbar.toolbar_fixed_bottom {
    position: fixed;
    bottom: 2rem;
}
</style>
