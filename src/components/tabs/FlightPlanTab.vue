<template>
    <BaseTab tab-name="flight_plan">
        <div class="content_wrapper">
            <!-- Title and Documentation -->
            <div class="cf_column">
                <div class="tab_title" v-html="$t('tabFlightPlan')"></div>
                <WikiButton docUrl="flight-plan" />
            </div>

            <!-- Two-column layout -->
            <div class="grid-row grid-box col2">
                <!-- Left Column: Map Display and Elevation Profile -->
                <div class="col-span-1">
                    <FlightPlanMap />
                    <ElevationProfile />
                </div>

                <!-- Right Column: Flight Plan List -->
                <div class="col-span-1">
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
                <div class="dialog-buttons">
                    <button @click="showClearDialog = false" class="cancel-btn">
                        {{ $t("cancel") }}
                    </button>
                    <button @click="confirmClear" class="clear-btn primary">
                        {{ $t("flightPlanClear") }}
                    </button>
                </div>
            </template>
        </Dialog>

        <!-- Bottom toolbar -->
        <div class="content_toolbar toolbar_fixed_bottom">
            <div class="btn clear-button">
                <a href="#" @click.prevent="handleClear" v-html="$t('flightPlanClear')"></a>
            </div>
            <div class="btn save-button">
                <a href="#" @click.prevent="handleSave" v-html="$t('save')"></a>
            </div>
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

const { loadPlan, savePlan, clearPlan, waypoints } = useFlightPlan();
const showClearDialog = ref(false);

onMounted(() => {
    console.log("FlightPlanTab mounted");
    loadPlan();
    GUI.content_ready();
});

const handleSave = () => {
    savePlan();
    gui_log(i18n.getMessage("flightPlanSaved"));
};

const handleClear = () => {
    if (waypoints.value.length === 0) {
        gui_log(i18n.getMessage("flightPlanNoWaypoints") || "No waypoints to clear");
        return;
    }

    showClearDialog.value = true;
};

const confirmClear = () => {
    clearPlan();
    showClearDialog.value = false;
};
</script>

<style scoped>
.grid-row.grid-box.col2 {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 1rem;
}

/* Bottom toolbar (CRITICAL: must be exactly 2rem) */
.content_toolbar.toolbar_fixed_bottom {
    position: fixed;
    bottom: 2rem;
}

.content_toolbar.toolbar_fixed_bottom .btn a {
    min-width: 125px;
    text-align: center;
}

/* Dialog buttons */
.dialog-buttons {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
}

.dialog-buttons button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--surface-500);
    background: var(--surface-200);
    color: var(--text);
    cursor: pointer;
    transition: background 0.2s;
}

.dialog-buttons button:hover {
    background: var(--surface-300);
}

.dialog-buttons .clear-btn.primary {
    background: var(--error-500);
    color: var(--surface-50);
    border-color: var(--error-500);
}

.dialog-buttons .clear-btn.primary:hover {
    background: var(--error-600);
    border-color: var(--error-600);
}

.dialog-buttons .cancel-btn:hover {
    background: var(--surface-400);
}

/* Responsive */
@media (max-width: 1055px) {
    .grid-row.grid-box.col2 {
        grid-template-columns: 1fr;
    }
}
</style>
