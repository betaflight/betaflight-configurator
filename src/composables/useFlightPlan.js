import { reactive, computed } from "vue";
import { get as getConfig, set as setConfig } from "../js/ConfigStorage";
import { gui_log } from "../js/gui_log";
import { i18n } from "../js/localization";
import MSP from "../js/msp";

const STORAGE_KEY = "flightPlans";
const DEFAULT_ALTITUDE = 400;
const DEFAULT_TYPE = "flyover";
const DEFAULT_SPEED = 10; // knots

// Unit conversion constants (configurator ↔ firmware)
const FEET_TO_CM = 30.48;
const KNOTS_TO_CMS = 51.4444;
const MINUTES_TO_DECISECONDS = 600;

// Type mapping (configurator → firmware)
const TYPE_TO_CLI = {
    flyover: "FLYOVER",
    flyby: "FLYBY",
    hold: "HOLD",
    land: "LAND",
};

// Type mapping (firmware → configurator)
const CLI_TO_TYPE = {
    FLYOVER: "flyover",
    FLYBY: "flyby",
    HOLD: "hold",
    LAND: "land",
};

// Pattern mapping (configurator → firmware)
const PATTERN_TO_CLI = {
    circle: "ORBIT",
    orbit: "ORBIT",
    figure8: "FIGURE8",
};

// Pattern mapping (firmware → configurator)
const CLI_TO_PATTERN = {
    ORBIT: "orbit",
    FIGURE8: "figure8",
};

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
            latitude: waypointData.latitude ?? 0,
            longitude: waypointData.longitude ?? 0,
            altitude: waypointData.altitude ?? DEFAULT_ALTITUDE,
            speed: waypointData.speed ?? DEFAULT_SPEED,
            type: waypointData.type ?? DEFAULT_TYPE,
            duration: waypointData.duration ?? 0,
            pattern: waypointData.pattern ?? "circle",
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

    // Send a CLI command and return the response lines as a Promise
    const sendCliCommand = (cmd) => {
        return new Promise((resolve, reject) => {
            MSP.send_cli_command(cmd, (data) => {
                if (data && Array.isArray(data) && data.length > 0) {
                    resolve([...data]);
                } else {
                    reject(new Error(`Empty response for: ${cmd}`));
                }
            });
        });
    };

    // Parse a "waypoint insert ..." CLI line into a waypoint object
    const parseWaypointLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("waypoint insert ")) {
            return null;
        }

        const parts = trimmed.split(/\s+/);
        // Expected: waypoint insert <idx> <lat> <lon> <alt> <spd> <type> <dur> <pat>
        if (parts.length < 10) {
            return null;
        }

        const altCm = parseInt(parts[5], 10);
        const speedCms = parseInt(parts[6], 10);
        const durationDs = parseInt(parts[8], 10);
        const typeName = parts[7].toUpperCase();
        const patternName = parts[9].toUpperCase();

        return {
            uid: generateUid(),
            latitude: parseFloat(parts[3]),
            longitude: parseFloat(parts[4]),
            altitude: Math.round(altCm / FEET_TO_CM),
            speed: Math.round((speedCms / KNOTS_TO_CMS) * 10) / 10,
            type: CLI_TO_TYPE[typeName] ?? DEFAULT_TYPE,
            duration: Math.round((durationDs / MINUTES_TO_DECISECONDS) * 10) / 10,
            pattern: CLI_TO_PATTERN[patternName] ?? "orbit",
            order: parseInt(parts[2], 10),
        };
    };

    // Convert a waypoint to a CLI insert command string
    const waypointToCliCommand = (wp, index) => {
        const lat = wp.latitude.toFixed(7);
        const lon = wp.longitude.toFixed(7);
        const altCm = Math.round(wp.altitude * FEET_TO_CM);
        const speedCms = Math.round(wp.speed * KNOTS_TO_CMS);
        const typeCli = TYPE_TO_CLI[wp.type] ?? "FLYOVER";
        const durationDs = Math.round(wp.duration * MINUTES_TO_DECISECONDS);
        const patternCli = PATTERN_TO_CLI[wp.pattern] ?? "ORBIT";

        return `waypoint insert ${index} ${lat} ${lon} ${altCm} ${speedCms} ${typeCli} ${durationDs} ${patternCli}`;
    };

    // Load waypoints from flight controller via CLI
    const loadFromFC = async () => {
        try {
            const response = await sendCliCommand("waypoint list");

            const waypoints = [];
            for (const line of response) {
                const wp = parseWaypointLine(line);
                if (wp) {
                    wp.order = waypoints.length;
                    waypoints.push(wp);
                }
            }

            state.waypoints = waypoints;
            state.selectedWaypointUid = null;
            state.editingWaypointUid = null;

            if (waypoints.length > 0) {
                gui_log(i18n.getMessage("flightPlanLoadedFromFC"));
            } else {
                gui_log(i18n.getMessage("flightPlanFCEmpty"));
            }

            // Cache to localStorage
            savePlan();
            console.log(`Loaded ${waypoints.length} waypoints from FC`);
        } catch (error) {
            console.error("Failed to load flight plan from FC:", error);
            gui_log(i18n.getMessage("flightPlanFCLoadError"));
            // Fall back to localStorage
            loadPlan();
        }
    };

    // Save waypoints to flight controller via CLI
    const saveToFC = async () => {
        try {
            const sorted = [...state.waypoints].sort((a, b) => a.order - b.order);

            // Clear existing waypoints on FC
            await sendCliCommand("waypoint clear");

            // Insert each waypoint
            for (let i = 0; i < sorted.length; i++) {
                await sendCliCommand(waypointToCliCommand(sorted[i], i));
            }

            // Persist to EEPROM
            await sendCliCommand("save");

            gui_log(i18n.getMessage("flightPlanSavedToFC"));

            // Also cache to localStorage
            savePlan();
            console.log(`Saved ${sorted.length} waypoints to FC`);
        } catch (error) {
            console.error("Failed to save flight plan to FC:", error);
            gui_log(i18n.getMessage("flightPlanFCSaveError"));
        }
    };

    // Clear waypoints on the flight controller
    const clearOnFC = async () => {
        try {
            await sendCliCommand("waypoint clear");
            await sendCliCommand("save");
            gui_log(i18n.getMessage("flightPlanClearedFC"));
        } catch (error) {
            console.error("Failed to clear flight plan on FC:", error);
            gui_log(i18n.getMessage("flightPlanFCSaveError"));
        }
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
        loadFromFC,
        saveToFC,
        clearOnFC,
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
