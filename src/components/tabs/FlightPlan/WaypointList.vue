<template>
    <UiBox :title="$t('flightPlanWaypointList')" type="neutral" class="waypoint-list">
        <div class="flex justify-end">
            <UButton
                icon="i-lucide-plus"
                size="sm"
                :aria-label="$t('flightPlanAddWaypoint')"
                @click="handleAddWaypoint"
            />
        </div>

        <div v-if="!waypoints.length" class="note">
            <p v-html="$t('flightPlanNoWaypoints')"></p>
        </div>
        <div v-else class="waypoints">
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
                <div class="flex gap-1 flex-shrink-0">
                    <UButton
                        icon="i-lucide-pencil"
                        size="xs"
                        variant="soft"
                        color="primary"
                        :aria-label="$t('edit')"
                        @click.stop="handleEdit(waypoint.uid)"
                    />
                    <UButton
                        icon="i-lucide-trash-2"
                        size="xs"
                        variant="soft"
                        color="error"
                        :aria-label="$t('delete')"
                        @click.stop="handleRemove(waypoint.uid)"
                    />
                </div>
            </div>
        </div>
    </UiBox>

    <!-- Delete Confirmation Dialog -->
    <Dialog v-model="showDeleteDialog" :title="$t('flightPlanDeleteWaypointTitle')">
        <p v-html="$t('flightPlanDeleteWaypointConfirm')"></p>

        <template #footer>
            <div class="flex gap-2 justify-end">
                <UButton variant="soft" color="neutral" @click="showDeleteDialog = false">
                    {{ $t("cancel") }}
                </UButton>
                <UButton color="error" @click="confirmDelete">
                    {{ $t("delete") }}
                </UButton>
            </div>
        </template>
    </Dialog>
</template>

<script setup>
import { ref } from "vue";
import Dialog from "@/components/elements/Dialog.vue";
import UiBox from "@/components/elements/UiBox.vue";
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
.note {
    padding: 1rem;
    text-align: center;
    color: var(--surface-700);
    font-style: italic;
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
</style>
