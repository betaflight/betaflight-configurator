<template>
    <div
        class="relative rounded-lg border-2"
        :class="[
            !collapsible || isOpen ? (highlight ? typeClass.box : 'border-neutral-500/30') : 'border-transparent',
            title ? 'mt-3' : '',
            collapsible && !isOpen ? 'min-h-6' : '',
        ]"
    >
        <div
            v-if="title"
            :class="[
                'flex gap-2 items-center w-fit p-1 px-3 rounded-full text-[13px] font-semibold absolute top-0 left-4 translate-y-[-50%]',
                typeClass.pill,
                collapsible ? 'cursor-pointer select-none' : '',
            ]"
            :role="collapsible ? 'button' : undefined"
            :tabindex="collapsible ? 0 : undefined"
            :aria-expanded="collapsible ? isOpen : undefined"
            @click="collapsible && toggle()"
            @keydown.enter.space.prevent="collapsible && toggle()"
        >
            <UIcon
                v-if="collapsible"
                :name="isOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                class="size-4"
            />
            <span>{{ title }}</span>
            <slot name="title"></slot>
            <HelpIcon v-if="help" :text="help" />
        </div>
        <div
            v-show="!collapsible || isOpen"
            :class="`flex flex-col ${padding ? 'p-3' : 'rounded-lg overflow-hidden p-0!'} gap-2 ${title ? 'pt-6' : ''}`"
        >
            <slot></slot>
        </div>
    </div>
</template>

<script setup>
import { ref, computed } from "vue";
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
    padding: {
        type: Boolean,
        default: true,
        required: false,
    },
    collapsible: {
        type: Boolean,
        default: false,
    },
    defaultOpen: {
        type: Boolean,
        default: true,
    },
});

const isOpen = ref(props.defaultOpen);
function toggle() {
    isOpen.value = !isOpen.value;
}

const typeClass = computed(() => {
    return (
        {
            default: {
                box: "border-primary bg-primary/15",
                pill: "bg-primary text-black",
            },
            success: {
                box: "border-success bg-success/15",
                pill: "bg-success text-black",
            },
            warning: {
                box: "border-warning bg-warning/15",
                pill: "bg-warning text-black",
            },
            error: {
                box: "border-error bg-error/15",
                pill: "bg-error text-white",
            },
            neutral: {
                box: "border-default bg-default/15",
                pill: "bg-elevated text-highlighted",
            },
        }[props.type] || {
            box: "border-primary bg-primary/15",
            pill: "bg-primary text-black",
        }
    );
});
</script>
