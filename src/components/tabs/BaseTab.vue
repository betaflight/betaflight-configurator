<template>
    <div :class="[`tab-${tabName}`, extraClass]">
        <slot></slot>
    </div>
</template>

<script>
import { defineComponent, onMounted, onUnmounted, inject } from "vue";
import GUI from "../../js/gui";

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
        // Access the global reactive model
        const model = inject("betaflightModel", null);

        onMounted(() => {
            GUI.active_tab = props.tabName;
            emit("mounted");
        });

        onUnmounted(() => {
            // Clean up any intervals/timeouts when tab is destroyed
            GUI.interval_kill_all();
            GUI.timeout_kill_all();
            emit("cleanup");
        });

        return { model };
    },
});
</script>
