<template>
    <div
        class="relative border-2 rounded-lg"
        :class="[highlight ? typeClass.box : 'border-neutral-500/30', title ? 'mt-3' : '']"
    >
        <div v-if="title" class="flex items-center absolute top-0 left-4 right-4 translate-y-[-50%]">
            <div
                :class="[
                    'flex gap-2 items-center p-1 px-3 rounded-full text-black text-[13px] font-semibold',
                    typeClass.pill,
                    collapsible ? 'cursor-pointer select-none' : '',
                ]"
                @click="collapsible && toggle()"
            >
                <UIcon
                    v-if="collapsible"
                    :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-3.5"
                />
                {{ title }}
                <slot name="title" />
                <HelpIcon v-if="help" :text="help" />
            </div>
            <div v-if="$slots.actions && expanded" class="ml-auto" @click.stop>
                <slot name="actions" />
            </div>
        </div>
        <div v-show="expanded" :class="`flex flex-col p-3 gap-2 ${title ? 'pt-6' : ''}`">
            <slot />
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from "vue";
import HelpIcon from "./HelpIcon.vue";

const props = defineProps({
    title: { type: String, default: undefined },
    help: { type: String, default: null },
    type: {
        type: String,
        default: "default",
        validator: (v) => ["default", "success", "warning", "error", "neutral"].includes(v),
    },
    highlight: { type: Boolean, default: false },
    collapsible: { type: Boolean, default: false },
    collapsed: { type: Boolean, default: false },
});

const expanded = ref(!props.collapsed);

function toggle() {
    expanded.value = !expanded.value;
}

const typeClass = computed(
    () =>
        ({
            default: { box: "border-primary bg-primary/15", pill: "bg-primary" },
            success: { box: "border-success bg-success/15", pill: "bg-success" },
            warning: { box: "border-warning bg-warning/15", pill: "bg-warning" },
            error: { box: "border-error bg-error/15", pill: "bg-error" },
            neutral: { box: "border-default bg-default/15", pill: "bg-elevated text-highlighted" },
        })[props.type] || { box: "border-primary bg-primary/15", pill: "bg-primary" },
);
</script>
