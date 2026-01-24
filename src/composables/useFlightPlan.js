import { reactive, computed } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { gui_log } from "../js/gui_log";
import { i18n } from "../js/localization";

const STORAGE_KEY = "flightPlans";
const DEFAULT_ALTITUDE = 400;
const DEFAULT_TYPE = "flyover";

// Shared state - singleton pattern ensures all components share the same state
const state = reactive({
    waypoints: [],
    selectedWaypointUid: null,
    editingWaypointUid: null,
    showEditorDialog: false,
});

// Shared computed properties
const sortedWaypoints = computed(() => {
    return [...state.waypoints].sort((a, b) => a.order - b.order);
});

const selectedWaypoint = computed(() => {
    return state.waypoints.find((wp) => wp.uid === state.selectedWaypointUid);
});

const editingWaypoint = computed(() => {
    return state.waypoints.find((wp) => wp.uid === state.editingWaypointUid);
});

export function useFlightPlan() {
    // Generate unique ID (timestamp + random for stability)
    const generateUid = () => {
        return Date.now() + Math.random();
    };

    // Validate waypoint data
    const validateWaypoint = (waypointData) => {
        if (waypointData.latitude < -90 || waypointData.latitude > 90) {
            gui_log(i18n.getMessage("flightPlanInvalidLatitude"));
            return false;
        }
        if (waypointData.longitude < -180 || waypointData.longitude > 180) {
            gui_log(i18n.getMessage("flightPlanInvalidLongitude"));
            return false;
        }
        if (waypointData.altitude < 0) {
            gui_log(i18n.getMessage("flightPlanInvalidAltitude") || "Altitude must be positive");
            return false;
        }
        return true;
    };

    // Load flight plan from localStorage
    const loadPlan = () => {
        try {
            const stored = getConfig(STORAGE_KEY);
            if (stored?.flightPlans?.currentPlan?.waypoints) {
                state.waypoints = stored.flightPlans.currentPlan.waypoints;
                console.log(`Loaded ${state.waypoints.length} waypoints from localStorage`);
            } else {
                state.waypoints = [];
                console.log("No existing flight plan found, starting fresh");
            }
        } catch (error) {
            console.error("Failed to load flight plan:", error);
            gui_log(i18n.getMessage("flightPlanLoadError"));
            state.waypoints = [];
        }
    };

    // Save flight plan to localStorage
    const savePlan = () => {
        try {
            // Read existing plan to preserve createdAt timestamp
            const existing = getConfig(STORAGE_KEY);
            const existingCreatedAt = existing?.flightPlans?.currentPlan?.createdAt;

            const planData = {
                [STORAGE_KEY]: {
                    currentPlan: {
                        name: "Default Plan",
                        waypoints: state.waypoints,
                        createdAt: existingCreatedAt ?? new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                },
            };
            setConfig(planData);
            console.log(`Saved ${state.waypoints.length} waypoints to localStorage`);
        } catch (error) {
            console.error("Failed to save flight plan:", error);
            gui_log(i18n.getMessage("flightPlanSaveError"));
        }
    };

    // Add waypoint
    const addWaypoint = (waypointData) => {
        // Validate coordinates and altitude
        if (!validateWaypoint(waypointData)) {
            return false;
        }

        const waypoint = {
            uid: generateUid(),
            latitude: waypointData.latitude || 0,
            longitude: waypointData.longitude || 0,
            altitude: waypointData.altitude || DEFAULT_ALTITUDE,
            type: waypointData.type || DEFAULT_TYPE,
            duration: waypointData.duration || 0,
            pattern: waypointData.pattern || "circle",
            order: state.waypoints.length,
        };

        state.waypoints.push(waypoint);
        savePlan();
        console.log("Added waypoint:", waypoint);
        return true;
    };

    // Add waypoint at map location (for click handler)
    const addWaypointAtLocation = (latitude, longitude) => {
        return addWaypoint({
            latitude,
            longitude,
            altitude: DEFAULT_ALTITUDE,
            type: DEFAULT_TYPE,
        });
    };

    // Update waypoint
    const updateWaypoint = (uid, updates) => {
        const waypoint = state.waypoints.find((wp) => wp.uid === uid);
        if (!waypoint) {
            console.error("Waypoint not found:", uid);
            return false;
        }

        // Validate if coordinates are being updated
        if (updates.latitude !== undefined || updates.longitude !== undefined || updates.altitude !== undefined) {
            const testData = {
                latitude: updates.latitude !== undefined ? updates.latitude : waypoint.latitude,
                longitude: updates.longitude !== undefined ? updates.longitude : waypoint.longitude,
                altitude: updates.altitude !== undefined ? updates.altitude : waypoint.altitude,
            };
            if (!validateWaypoint(testData)) {
                return false;
            }
        }

        Object.assign(waypoint, updates);
        savePlan();
        console.log("Updated waypoint:", waypoint);
        return true;
    };

    // Remove waypoint
    const removeWaypoint = (uid) => {
        const index = state.waypoints.findIndex((wp) => wp.uid === uid);
        if (index === -1) {
            console.error("Waypoint not found:", uid);
            return false;
        }

        state.waypoints.splice(index, 1);

        // Reorder remaining waypoints
        state.waypoints.forEach((wp, idx) => {
            wp.order = idx;
        });

        // Clear selection if removed waypoint was selected
        if (state.selectedWaypointUid === uid) {
            state.selectedWaypointUid = null;
        }
        if (state.editingWaypointUid === uid) {
            state.editingWaypointUid = null;
        }

        savePlan();
        console.log("Removed waypoint:", uid);
        return true;
    };

    // Reorder waypoints (for drag-and-drop)
    const reorderWaypoints = (fromUid, toUid) => {
        const fromIndex = state.waypoints.findIndex((wp) => wp.uid === fromUid);
        let toIndex = state.waypoints.findIndex((wp) => wp.uid === toUid);

        if (fromIndex === -1 || toIndex === -1) {
            console.error("Waypoint not found for reordering");
            return false;
        }

        // Remove the waypoint from its current position
        const [movedWaypoint] = state.waypoints.splice(fromIndex, 1);

        // When moving downward, adjust toIndex to account for the removed item
        if (fromIndex < toIndex) {
            toIndex--;
        }

        // Insert it at the new position
        state.waypoints.splice(toIndex, 0, movedWaypoint);

        // Update order properties for all waypoints
        state.waypoints.forEach((wp, idx) => {
            wp.order = idx;
        });

        savePlan();
        console.log("Reordered waypoint:", fromUid, "to position:", toIndex);
        return true;
    };

    // Clear all waypoints
    const clearPlan = () => {
        state.waypoints = [];
        state.selectedWaypointUid = null;
        state.editingWaypointUid = null;
        savePlan();
        gui_log(i18n.getMessage("flightPlanCleared"));
        console.log("Cleared all waypoints");
    };

    // Select waypoint (for UI highlighting)
    const selectWaypoint = (uid) => {
        state.selectedWaypointUid = uid;
        console.log("Selected waypoint:", uid);
    };

    // Start editing waypoint
    const editWaypoint = (uid) => {
        state.editingWaypointUid = uid;
        state.showEditorDialog = true;
        console.log("Editing waypoint:", uid);
    };

    // Open editor in add mode
    const openAddWaypoint = () => {
        state.editingWaypointUid = null;
        state.showEditorDialog = true;
        console.log("Opening waypoint editor in add mode");
    };

    // Cancel editing
    const cancelEdit = () => {
        state.editingWaypointUid = null;
        console.log("Cancelled editing");
    };

    // Get waypoint type label for display
    const getWaypointTypeLabel = (type) => {
        const labels = {
            flyover: i18n.getMessage("flightPlanTypeFlyover"),
            flyby: i18n.getMessage("flightPlanTypeFlyby"),
            hold: i18n.getMessage("flightPlanTypeHold"),
            land: i18n.getMessage("flightPlanTypeLand"),
        };
        return labels[type] || type;
    };

    return {
        // State (as computed for read-only access)
        waypoints: computed(() => state.waypoints),
        sortedWaypoints, // Already a computed property
        selectedWaypointUid: computed(() => state.selectedWaypointUid),
        editingWaypointUid: computed(() => state.editingWaypointUid),
        showEditorDialog: computed({
            get: () => state.showEditorDialog,
            set: (value) => {
                state.showEditorDialog = value;
            },
        }),
        selectedWaypoint, // Already a computed property
        editingWaypoint, // Already a computed property

        // Methods
        loadPlan,
        savePlan,
        addWaypoint,
        addWaypointAtLocation,
        updateWaypoint,
        removeWaypoint,
        reorderWaypoints,
        clearPlan,
        selectWaypoint,
        editWaypoint,
        openAddWaypoint,
        cancelEdit,
        getWaypointTypeLabel,
    };
}
