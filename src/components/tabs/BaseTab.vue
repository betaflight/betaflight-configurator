<template>
    <div :class="[`tab-${tabName}`, extraClass]">
        <slot></slot>
    </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onUnmounted, inject } from "vue";
import { useNavigationStore } from "../../stores/navigation";

/**
 * BaseTab provides common tab lifecycle management for Vue tabs.
 *
 * Usage:
 *   <BaseTab tab-name="help" @mounted="onTabMounted">
 *     <template>...content...</template>
 *   </BaseTab>
 */
export default defineComponent({
    name: "BaseTab",
    props: {
        tabName: {
            type: String,
            required: true,
        },
        extraClass: {
            type: String,
            default: "",
        },
    },
    emits: ["mounted", "cleanup"],
    setup(props, { emit }) {
        const navigationStore = useNavigationStore();
        // Access the global reactive model
        const model = inject("betaflightModel", null);

        onMounted(() => {
            navigationStore.activeTab = props.tabName;
            emit("mounted");
        });

        onUnmounted(() => {
            // Clean up any intervals/timeouts when tab is destroyed
            // Global cleanup removed to allow tabs to manage their own intervals individually
            emit("cleanup");
        });

        return { model };
    },
});
</script>
