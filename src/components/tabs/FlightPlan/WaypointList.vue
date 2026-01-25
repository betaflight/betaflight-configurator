<template>
    <div class="gui_box grey waypoint-list">
        <div class="gui_box_titlebar">
            <div class="spacer_box_title" v-html="$t('flightPlanWaypointList')"></div>
        </div>
        <div class="spacer_box">
            <div class="add-waypoint-row">
                <button @click="handleAddWaypoint" class="add-waypoint-btn" :aria-label="$t('flightPlanAddWaypoint')">
                    <i class="fa fa-plus"></i>
                </button>
            </div>

            <div v-if="!waypoints.length" class="note">
                <p v-html="$t('flightPlanNoWaypoints')"></p>
            </div>
            <div v-else>
                <!-- Add waypoint button row -->
                <!-- Waypoints list -->
                <div class="waypoints">
                    <div
                        v-for="waypoint in sortedWaypoints"
                        :key="waypoint.uid"
                        class="waypoint-item"
                        :class="{
                            selected: selectedWaypointUid === waypoint.uid,
                            'drag-over': dragOverUid === waypoint.uid,
                        }"
                        draggable="true"
                        @click="selectWaypoint(waypoint.uid)"
                        @dragstart="handleDragStart($event, waypoint.uid)"
                        @dragover="handleDragOver($event, waypoint.uid)"
                        @dragleave="handleDragLeave($event)"
                        @drop="handleDrop($event, waypoint.uid)"
                        @dragend="handleDragEnd($event)"
                    >
                        <div class="waypoint-order">{{ waypoint.order + 1 }}</div>
                        <div class="waypoint-info">
                            <div class="waypoint-coords">
                                {{ waypoint.latitude.toFixed(6) }}°, {{ waypoint.longitude.toFixed(6) }}°
                            </div>
                            <div class="waypoint-details">
                                {{ waypoint.altitude }}ft AMSL - {{ waypoint.speed }}kts -
                                {{ getWaypointTypeLabel(waypoint.type) }}
                                <span v-if="waypoint.type === 'hold'" class="hold-details">
                                    ({{ waypoint.duration }}min, {{ getPatternLabel(waypoint.pattern) }})
                                </span>
                            </div>
                        </div>
                        <div class="waypoint-actions">
                            <button @click.stop="handleEdit(waypoint.uid)" :aria-label="$t('edit')" class="edit-btn">
                                <i class="fa fa-edit"></i>
                            </button>
                            <button
                                @click.stop="handleRemove(waypoint.uid)"
                                :aria-label="$t('delete')"
                                class="delete-btn"
                            >
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model="showDeleteDialog" :title="$t('flightPlanDeleteWaypointTitle')">
        <p v-html="$t('flightPlanDeleteWaypointConfirm')"></p>

        <template #footer>
            <div class="dialog-buttons">
                <button @click="showDeleteDialog = false" class="cancel-btn">
                    {{ $t("cancel") }}
                </button>
                <button @click="confirmDelete" class="delete-btn primary">
                    {{ $t("delete") }}
                </button>
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { ref } from "vue";
import Dialog from "@/components/elements/Dialog.vue";
import { useFlightPlan } from "@/composables/useFlightPlan";
import { i18n } from "@/js/localization";

const {
    waypoints,
    sortedWaypoints,
    selectedWaypointUid,
    selectWaypoint,
    editWaypoint,
    openAddWaypoint,
    removeWaypoint,
    reorderWaypoints,
    getWaypointTypeLabel,
} = useFlightPlan();

const showDeleteDialog = ref(false);
const waypointToDelete = ref(null);

// Drag and drop state
const draggedUid = ref(null);
const dragOverUid = ref(null);

const handleAddWaypoint = () => {
    openAddWaypoint();
};

const handleEdit = (uid) => {
    editWaypoint(uid);
};

const handleRemove = (uid) => {
    waypointToDelete.value = uid;
    showDeleteDialog.value = true;
};

const confirmDelete = () => {
    if (waypointToDelete.value) {
        removeWaypoint(waypointToDelete.value);
        waypointToDelete.value = null;
    }
    showDeleteDialog.value = false;
};

const getPatternLabel = (pattern) => {
    const labels = {
        circle: i18n.getMessage("flightPlanPatternCircle"),
        figure8: i18n.getMessage("flightPlanPatternFigure8"),
        orbit: i18n.getMessage("flightPlanPatternOrbit"),
    };
    return labels[pattern] || pattern;
};

// Drag and drop handlers
const handleDragStart = (event, uid) => {
    draggedUid.value = uid;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", uid);

    // Capture element synchronously before setTimeout (event.currentTarget becomes null inside timeout)
    const el = event.currentTarget;

    // Add a slight delay to allow the drag to start before styling changes
    setTimeout(() => {
        if (el) {
            el.classList.add("dragging");
        }
    }, 0);
};

const handleDragOver = (event, uid) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    if (draggedUid.value !== uid) {
        dragOverUid.value = uid;
    }
};

const handleDragLeave = (event) => {
    // Only clear dragOver if we're leaving the waypoint item entirely
    if (event.currentTarget.contains(event.relatedTarget)) {
        return;
    }
    dragOverUid.value = null;
};

const handleDrop = (event, targetUid) => {
    event.preventDefault();

    if (draggedUid.value && draggedUid.value !== targetUid) {
        reorderWaypoints(draggedUid.value, targetUid);
    }

    // Clean up
    draggedUid.value = null;
    dragOverUid.value = null;
};

const handleDragEnd = (event) => {
    event.currentTarget.classList.remove("dragging");
    draggedUid.value = null;
    dragOverUid.value = null;
};
</script>

<style scoped>
.waypoint-list {
    margin-bottom: 1rem;
    display: flex;
    flex-direction: column;
    min-height: 50%;
}

.waypoint-list .spacer_box {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
}

.add-waypoint-row {
    display: flex;
    justify-content: flex-end;
    padding: 0.35rem 0.5rem;
    flex-shrink: 0;
}

.add-waypoint-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--primary-500);
    color: var(--surface-50);
    border: 1px solid var(--primary-500);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    transition: background 0.2s;
}

.add-waypoint-btn:hover {
    background: var(--primary-600);
    border-color: var(--primary-600);
}

.note {
    padding: 1rem;
    text-align: center;
    color: var(--surface-700);
    font-style: italic;
}

.waypoints {
    flex: 1;
    min-height: 0;
    max-height: 60dvh;
    overflow-y: scroll;
}

.waypoint-item {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    background: var(--surface-50);
    border-bottom: 1px solid var(--surface-500);
    color: var(--text);
    cursor: grab;
    transition:
        background 0.2s,
        opacity 0.2s,
        transform 0.2s;
}

.waypoint-item:active {
    cursor: grabbing;
}

.waypoint-item.dragging {
    opacity: 0.4;
}

.waypoint-item.drag-over {
    border-top: 3px solid var(--primary-500);
    transform: translateY(2px);
}

.waypoint-item:first-child {
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
}

.waypoint-item:last-child {
    border-bottom-left-radius: 8px;
    border-bottom-right-radius: 8px;
    border-bottom: none;
}

.waypoint-item:hover {
    background: var(--surface-100);
}

.waypoint-item.selected {
    background: var(--primary-500);
    border-left: 3px solid var(--primary-700);
}

.waypoint-item.selected .waypoint-order {
    background: var(--surface-50);
    color: var(--primary-500);
}

.waypoint-item.selected .waypoint-coords,
.waypoint-item.selected .waypoint-details {
    color: var(--surface-50);
}

.waypoint-item.selected .waypoint-actions button {
    background: var(--surface-50);
    border-color: var(--surface-50);
    color: var(--primary-500);
}

.waypoint-item.selected .waypoint-actions button:hover {
    background: var(--surface-100);
    border-color: var(--surface-100);
}

.waypoint-order {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--primary-500);
    color: var(--surface-50);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    margin-right: 0.75rem;
    flex-shrink: 0;
}

.waypoint-info {
    flex: 1;
    min-width: 0;
}

.waypoint-coords {
    font-size: 0.85rem;
    color: var(--text);
    font-weight: 500;
}

.waypoint-details {
    font-size: 0.75rem;
    color: var(--surface-700);
    margin-top: 0.2rem;
}

.hold-details {
    font-style: italic;
}

.waypoint-actions {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
}

.waypoint-actions button {
    padding: 0.4rem;
    background: var(--surface-200);
    border: 1px solid var(--surface-500);
    color: var(--text);
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s;
}

.waypoint-actions button:hover {
    background: var(--surface-300);
}

.edit-btn:hover {
    background: var(--primary-200);
    border-color: var(--primary-500);
}

.delete-btn:hover {
    background: var(--error-200);
    border-color: var(--error-500);
    color: var(--error-700);
}

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

.dialog-buttons .delete-btn.primary {
    background: var(--error-500);
    color: var(--surface-50);
    border-color: var(--error-500);
}

.dialog-buttons .delete-btn.primary:hover {
    background: var(--error-600);
    border-color: var(--error-600);
}

.dialog-buttons .cancel-btn:hover {
    background: var(--surface-400);
}
</style>
