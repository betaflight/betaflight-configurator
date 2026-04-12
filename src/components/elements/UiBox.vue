<template>
    <div
        class="relative border-2 rounded-lg mt-3"
        :class="highlight ? [typeClass.border, typeClass.borderColor, typeClass.softBg] : 'border-neutral-500/30'"
    >
        <div
            v-if="title"
            :class="`flex gap-2 items-center absolute top-0 left-4 translate-y-[-50%] p-1 px-3 rounded-full text-black text-[13px] font-semibold ${typeClass.bg}`"
        >
            {{ title }}
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
        required: true,
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
            return ["default", "info", "warning", "error"].includes(value);
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
                bg: "bg-primary",
                border: "border-primary",
                softBg: "bg-primary/15",
                borderColor: "border-primary",
            },
            info: {
                bg: "bg-success",
                border: "border-success",
                softBg: "bg-success/15",
                borderColor: "border-success",
            },
            warning: {
                bg: "bg-warning",
                border: "border-warning",
                softBg: "bg-warning/15",
                borderColor: "border-warning",
            },
            error: {
                bg: "bg-error",
                border: "border-error",
                softBg: "bg-error/15",
                borderColor: "border-error",
            },
        }[props.type] || {
            bg: "bg-primary",
            border: "border-primary",
            softBg: "bg-primary/15",
            borderColor: "border-primary",
        }
    );
});
</script>
