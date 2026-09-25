/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

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
const TYPE_TO_CLI: Record<string, string | undefined> = {
    flyover: "FLYOVER",
    flyby: "FLYBY",
    hold: "HOLD",
    land: "LAND",
    takeoff: "TAKEOFF",
    alt_change: "ALT_CHANGE",
    delay: "DELAY",
    yaw_rate: "YAW_RATE",
};

// Type mapping (firmware → configurator)
const CLI_TO_TYPE: Record<string, string | undefined> = {
    FLYOVER: "flyover",
    FLYBY: "flyby",
    HOLD: "hold",
    LAND: "land",
    TAKEOFF: "takeoff",
    ALT_CHANGE: "alt_change",
    DELAY: "delay",
    YAW_RATE: "yaw_rate",
};

// Modifier types carry no horizontal position; they mutate executor state and
// then drain onto the next positional waypoint. Map/profile views skip these.
const MODIFIER_TYPES = new Set(["alt_change", "delay", "yaw_rate"]);

export const isModifierWaypointType = (type: string | undefined) => type !== undefined && MODIFIER_TYPES.has(type);

// Pattern mapping (configurator → firmware)
const PATTERN_TO_CLI: Record<string, string | undefined> = {
    circle: "ORBIT",
    orbit: "ORBIT",
    figure8: "FIGURE8",
};

// Pattern mapping (firmware → configurator)
const CLI_TO_PATTERN: Record<string, string | undefined> = {
    ORBIT: "orbit",
    FIGURE8: "figure8",
};

export interface Waypoint {
    uid: string;
    latitude: number;
    longitude: number;
    /** feet AMSL */
    altitude: number;
    /** knots; degrees/sec for yaw_rate */
    speed: number;
    type: string;
    /** minutes */
    duration: number;
    pattern: string;
    order: number;
}

/** What the editor and the map hand to addWaypoint / updateWaypoint; missing slots get defaults. */
export type WaypointInput = Partial<Omit<Waypoint, "uid" | "order">>;

interface StoredFlightPlans {
    currentPlan?: {
        name: string;
        waypoints: Waypoint[];
        createdAt: string;
        updatedAt: string;
    };
}

// Shared state - singleton pattern ensures all components share the same state
const state = reactive({
    waypoints: [] as Waypoint[],
    selectedWaypointUid: null as string | null,
    editingWaypointUid: null as string | null,
    showEditorDialog: false,
});

// Shared computed properties
const sortedWaypoints = computed(() => {
    return [...state.waypoints].sort((a, b) => a.order - b.order);
});

// Positional waypoints only — used by map and elevation profile, which both
// rely on lat/lon and would otherwise plot modifier waypoints at (0,0).
const positionalWaypoints = computed(() => {
    return sortedWaypoints.value.filter((wp) => !isModifierWaypointType(wp.type));
});

const selectedWaypoint = computed(() => {
    return state.waypoints.find((wp) => wp.uid === state.selectedWaypointUid);
});

const editingWaypoint = computed(() => {
    return state.waypoints.find((wp) => wp.uid === state.editingWaypointUid);
});

// The one slot each modifier type needs, and the message when it is missing or negative.
const MODIFIER_SLOTS: Partial<
    Record<string, { slot: "altitude" | "duration" | "speed"; key: string; fallback: string }>
> = {
    alt_change: { slot: "altitude", key: "flightPlanInvalidAltitude", fallback: "Altitude must be positive" },
    delay: { slot: "duration", key: "flightPlanInvalidDuration", fallback: "Duration must be positive" },
    yaw_rate: { slot: "speed", key: "flightPlanInvalidYawRate", fallback: "Yaw rate must be positive" },
};

function validateModifierWaypoint(waypointData: WaypointInput): boolean {
    const rule = waypointData.type === undefined ? undefined : MODIFIER_SLOTS[waypointData.type];
    if (!rule) {
        return true;
    }
    const value = waypointData[rule.slot];
    if (value === undefined || !Number.isFinite(value) || value < 0) {
        gui_log(i18n.getMessage(rule.key) || rule.fallback);
        return false;
    }
    return true;
}

function validatePositionalWaypoint(waypointData: WaypointInput): boolean {
    // An absent slot falls back to a default in addWaypoint, and undefined fails every comparison.
    const { latitude = Number.NaN, longitude = Number.NaN, altitude = Number.NaN } = waypointData;
    if (latitude < -90 || latitude > 90) {
        gui_log(i18n.getMessage("flightPlanInvalidLatitude"));
        return false;
    }
    if (longitude < -180 || longitude > 180) {
        gui_log(i18n.getMessage("flightPlanInvalidLongitude"));
        return false;
    }
    if (altitude < 0) {
        gui_log(i18n.getMessage("flightPlanInvalidAltitude") || "Altitude must be positive");
        return false;
    }
    return true;
}

export function useFlightPlan() {
    // Validate waypoint data
    const validateWaypoint = (waypointData: WaypointInput) => {
        // Modifier types carry no horizontal position — skip coord checks but
        // still validate the slot that's meaningful for each modifier type.
        if (isModifierWaypointType(waypointData.type)) {
            return validateModifierWaypoint(waypointData);
        }
        return validatePositionalWaypoint(waypointData);
    };

    // Load flight plan from localStorage
    const loadPlan = () => {
        try {
            const stored = getConfig<StoredFlightPlans | undefined>(STORAGE_KEY);
            const storedWaypoints = stored?.flightPlans?.currentPlan?.waypoints;
            if (storedWaypoints) {
                state.waypoints = storedWaypoints;
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
            const existing = getConfig<StoredFlightPlans | undefined>(STORAGE_KEY);
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
    const addWaypoint = (waypointData: WaypointInput) => {
        // Validate coordinates and altitude
        if (!validateWaypoint(waypointData)) {
            return false;
        }

        const waypoint: Waypoint = {
            uid: crypto.randomUUID(),
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
    const addWaypointAtLocation = (latitude: number, longitude: number) => {
        return addWaypoint({
            latitude,
            longitude,
            altitude: DEFAULT_ALTITUDE,
            type: DEFAULT_TYPE,
        });
    };

    // Update waypoint
    const updateWaypoint = (uid: string | null, updates: WaypointInput) => {
        const waypoint = state.waypoints.find((wp) => wp.uid === uid);
        if (!waypoint) {
            console.error("Waypoint not found:", uid);
            return false;
        }

        // Validate against the merged state so modifier-specific guards see
        // their relevant slot (altitude/duration/speed), not just lat/lon/alt.
        if (!validateWaypoint({ ...waypoint, ...updates })) {
            return false;
        }

        Object.assign(waypoint, updates);
        savePlan();
        console.log("Updated waypoint:", waypoint);
        return true;
    };

    // Remove waypoint
    const removeWaypoint = (uid: string) => {
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
    const reorderWaypoints = (fromUid: string, toUid: string) => {
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
    const selectWaypoint = (uid: string | null) => {
        state.selectedWaypointUid = uid;
        console.log("Selected waypoint:", uid);
    };

    // Start editing waypoint
    const editWaypoint = (uid: string) => {
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
    const sendCliCommand = (cmd: string) => {
        return new Promise<string[]>((resolve, reject) => {
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
    const parseWaypointLine = (line: string): Waypoint | null => {
        const trimmed = line.trim();
        if (!trimmed.startsWith("waypoint insert ")) {
            return null;
        }

        const parts = trimmed.split(/\s+/);
        // Expected: waypoint insert <idx> <lat> <lon> <alt> <spd> <type> <dur> <pat>
        if (parts.length < 10) {
            return null;
        }

        const altCm = Number.parseInt(parts[5], 10);
        const speedRaw = Number.parseInt(parts[6], 10);
        const durationDs = Number.parseInt(parts[8], 10);
        const typeName = parts[7].toUpperCase();
        const patternName = parts[9].toUpperCase();
        const type = CLI_TO_TYPE[typeName] ?? DEFAULT_TYPE;

        return {
            uid: crypto.randomUUID(),
            latitude: Number.parseFloat(parts[3]),
            longitude: Number.parseFloat(parts[4]),
            altitude: Math.round(altCm / FEET_TO_CM),
            // YAW_RATE stores degrees/sec in the speed slot, not cm/s.
            speed: type === "yaw_rate" ? speedRaw : Math.round((speedRaw / KNOTS_TO_CMS) * 10) / 10,
            type,
            duration: Math.round((durationDs / MINUTES_TO_DECISECONDS) * 10) / 10,
            pattern: CLI_TO_PATTERN[patternName] ?? "orbit",
            order: Number.parseInt(parts[2], 10),
        };
    };

    // Convert a waypoint to a CLI insert command string
    const waypointToCliCommand = (wp: Waypoint, index: number) => {
        const lat = wp.latitude.toFixed(7);
        const lon = wp.longitude.toFixed(7);
        const altCm = Math.round(wp.altitude * FEET_TO_CM);
        const speedRaw = wp.type === "yaw_rate" ? Math.round(wp.speed) : Math.round(wp.speed * KNOTS_TO_CMS);
        const typeCli = TYPE_TO_CLI[wp.type] ?? "FLYOVER";
        const durationDs = Math.round(wp.duration * MINUTES_TO_DECISECONDS);
        const patternCli = PATTERN_TO_CLI[wp.pattern] ?? "ORBIT";

        return `waypoint insert ${index} ${lat} ${lon} ${altCm} ${speedRaw} ${typeCli} ${durationDs} ${patternCli}`;
    };

    // Load waypoints from flight controller via CLI
    const loadFromFC = async () => {
        try {
            const response = await sendCliCommand("waypoint list");

            const waypoints: Waypoint[] = [];
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
    const getWaypointTypeLabel = (type: string) => {
        const labels: Record<string, string | undefined> = {
            flyover: i18n.getMessage("flightPlanTypeFlyover"),
            flyby: i18n.getMessage("flightPlanTypeFlyby"),
            hold: i18n.getMessage("flightPlanTypeHold"),
            land: i18n.getMessage("flightPlanTypeLand"),
            takeoff: i18n.getMessage("flightPlanTypeTakeoff"),
            alt_change: i18n.getMessage("flightPlanTypeAltChange"),
            delay: i18n.getMessage("flightPlanTypeDelay"),
            yaw_rate: i18n.getMessage("flightPlanTypeYawRate"),
        };
        return labels[type] || type;
    };

    return {
        // State (as computed for read-only access)
        waypoints: computed(() => state.waypoints),
        sortedWaypoints, // Already a computed property
        positionalWaypoints, // Already a computed property
        selectedWaypointUid: computed(() => state.selectedWaypointUid),
        editingWaypointUid: computed(() => state.editingWaypointUid),
        showEditorDialog: computed({
            get: () => state.showEditorDialog,
            set: (value: boolean) => {
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
        isModifierWaypointType,
    };
}
