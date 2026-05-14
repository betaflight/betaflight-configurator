<template>
    <UModal v-model:open="open" :title="title">
        <template #body>
            <div class="connect-options">
                <p class="connect-options__help">
                    {{ mode === "virtual" ? $t("connectVirtualDescription") : $t("connectManualDescription") }}
                </p>
                <label v-if="mode === 'virtual'" class="connect-options__field">
                    <span>{{ $t("virtualMSPVersion") }}</span>
                    <USelect v-model="version" :items="firmwareVersions" size="sm" :ui="{ content: 'max-h-96' }" />
                </label>
                <label v-else class="connect-options__field">
                    <span>{{ $t("portOverrideText") }}</span>
                    <UInput v-model="portOverride" size="sm" autofocus />
                </label>
            </div>
        </template>
        <template #footer>
            <div class="connect-options__actions">
                <UButton color="neutral" variant="soft" size="sm" @click="onCancel">
                    {{ $t("cancel") }}
                </UButton>
                <UButton color="success" variant="soft" size="sm" :disabled="!canConfirm" @click="onConfirm">
                    {{ $t("connect") }}
                </UButton>
            </div>
        </template>
    </UModal>
</template>

<script>
import { computed, defineComponent, ref, watch } from "vue";
import { i18n } from "../../js/localization";

const FIRMWARE_VERSIONS = [
    { value: "1.48.0", label: "MSP: 1.48 | Firmware: 2026.06.*" },
    { value: "1.47.0", label: "MSP: 1.47 | Firmware: 2025.12.*" },
    { value: "1.46.0", label: "MSP: 1.46 | Firmware: 4.5.*" },
    { value: "1.45.0", label: "MSP: 1.45 | Firmware: 4.4.*" },
    { value: "1.44.0", label: "MSP: 1.44 | Firmware: 4.3.*" },
];

export default defineComponent({
    name: "ConnectOptionsDialog",
    props: {
        modelValue: { type: Boolean, default: false },
        mode: { type: String, default: "virtual" },
        initialVersion: { type: String, default: "1.46.0" },
        initialPortOverride: { type: String, default: "/dev/rfcomm0" },
    },
    emits: ["update:modelValue", "confirm"],
    setup(props, { emit }) {
        const open = computed({
            get: () => props.modelValue,
            set: (v) => emit("update:modelValue", v),
        });

        const version = ref(props.initialVersion);
        const portOverride = ref(props.initialPortOverride);

        watch(
            () => props.modelValue,
            (isOpen) => {
                if (isOpen) {
                    version.value = props.initialVersion;
                    portOverride.value = props.initialPortOverride;
                }
            },
        );

        const title = computed(() =>
            i18n.getMessage(props.mode === "virtual" ? "portsSelectVirtual" : "portsSelectManual"),
        );

        const canConfirm = computed(() => {
            if (props.mode === "manual") {
                return portOverride.value.trim().length > 0;
            }
            return Boolean(version.value);
        });

        function onCancel() {
            open.value = false;
        }

        function onConfirm() {
            if (!canConfirm.value) {
                return;
            }
            emit("confirm", {
                mode: props.mode,
                version: version.value,
                portOverride: portOverride.value.trim(),
            });
            open.value = false;
        }

        return {
            open,
            version,
            portOverride,
            firmwareVersions: FIRMWARE_VERSIONS,
            title,
            canConfirm,
            onCancel,
            onConfirm,
        };
    },
});
</script>

<style scoped>
.connect-options {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: min(26rem, 80vw);
}

.connect-options__help {
    margin: 0;
    color: var(--text);
    opacity: 0.8;
    font-size: 0.875rem;
}

.connect-options__field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
}

.connect-options__field span {
    font-size: 0.875rem;
    color: var(--text);
}

.connect-options__actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
}
</style>
