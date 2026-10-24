<template>
    <!-- the frame test's spin check, where the motor direction is set -->
    <div v-if="verdict" :title="$t('motorsSpinCheckNote')">
        <UAlert
            :color="verdict.ok ? 'success' : 'error'"
            variant="subtle"
            :icon="verdict.ok ? 'i-lucide-rotate-cw' : 'i-lucide-triangle-alert'"
            :title="verdict.ok ? $t('motorsSpinChecked') : $t('motorsSpinCheckFailed')"
            :description="spinText(verdict)"
            :ui="{ title: 'text-highlighted font-medium', description: 'text-default' }"
        />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useFrameWizardStore } from "@/stores/frameWizard";
import { spinVerdict } from "@/stores/frameSpinCheck";
import { spinText } from "./spinText";

const wizard = useFrameWizardStore();

const verdict = computed(() => (wizard.spinCheck?.done ? spinVerdict(wizard.spinCheck) : null));

onMounted(() => void wizard.loadSpinCheck());
</script>
