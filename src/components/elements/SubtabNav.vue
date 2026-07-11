<template>
    <div class="subtab-nav">
        <UTabs
            :items="items"
            :model-value="modelValue"
            :content="false"
            color="primary"
            variant="link"
            @update:model-value="$emit('update:modelValue', $event)"
        />
    </div>
</template>

<script>
import { defineComponent } from "vue";

export default defineComponent({
    name: "SubtabNav",
    props: {
        items: {
            type: Array,
            required: true,
        },
        modelValue: {
            type: String,
            required: true,
        },
    },
    emits: ["update:modelValue"],
});
</script>

<style scoped>
.subtab-nav {
    width: calc(100% - 22px);
    margin-bottom: 6px;
}
</style>
