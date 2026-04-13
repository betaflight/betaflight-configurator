<template>
    <div
        class="relative border-2 rounded-lg"
        :class="[highlight ? typeClass.box : 'border-neutral-500/30', title ? 'mt-3' : '']"
    >
        <div
            v-if="title"
            :class="`flex gap-2 items-center absolute top-0 left-4 translate-y-[-50%] p-1 px-3 rounded-full text-black text-[13px] font-semibold ${typeClass.pill}`"
        >
            <div v-html="title"></div>
            <slot name="title"></slot>
            <HelpIcon v-if="help" :text="help" />
        </div>
        <div :class="`flex flex-col p-3 gap-2 ${title ? 'pt-6' : ''}`">
            <slot></slot>
        </div>
    </div>
</template>

<script setup>
import { computed } from "vue";
import HelpIcon from "./HelpIcon.vue";

const props = defineProps({
    title: {
        type: String,
        required: false,
    },
    help: {
        type: String,
        default: null,
        required: false,
    },
    type: {
        type: String,
        default: "default",
        required: false,
        validator: (value) => {
            return ["default", "success", "warning", "error", "neutral"].includes(value);
        },
    },
    highlight: {
        type: Boolean,
        default: false,
        required: false,
    },
});

const typeClass = computed(() => {
    return (
        {
            default: {
                box: "border-primary bg-primary/15",
                pill: "bg-primary",
            },
            success: {
                box: "border-success bg-success/15",
                pill: "bg-success",
            },
            warning: {
                box: "border-warning bg-warning/15",
                pill: "bg-warning",
            },
            error: {
                box: "border-error bg-error/15",
                pill: "bg-error",
            },
            neutral: {
                box: "border-default bg-default/15",
                pill: "bg-elevated text-highlighted",
            },
        }[props.type] || {
            box: "border-primary bg-primary/15",
            pill: "bg-primary",
        }
    );
});
</script>
