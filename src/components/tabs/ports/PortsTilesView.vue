<template>
    <UiBox type="warning" highlight class="mb-4">
        <p v-html="$t('portsTilesHelp')"></p>
    </UiBox>

    <TabLoadingState v-if="isLoading" size="size-8" color-class="text-muted">
        <span class="ml-2 text-dimmed">{{ $t("dataWaitingForData") }}</span>
    </TabLoadingState>

    <template v-else-if="!supported">
        <UiBox type="neutral" highlight>
            <p v-html="$t('portsPeripheralsUnsupported')"></p>
        </UiBox>
    </template>

    <template v-else>
        <div class="text-sm font-semibold mt-4 mb-2" v-html="$t('portsSectionSerial')"></div>
        <div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,22rem))] gap-3">
            <UiBox v-for="port in serialTiles" :key="port.identifier" type="neutral" :title="port.displayName">
                <div v-if="!port.claims.length" class="text-xs text-dimmed">
                    {{ $t("portsTileUnassigned") }}
                </div>
                <div v-for="claim in port.claims" :key="claim.name" class="flex items-center gap-2 text-xs">
                    <UIcon
                        :name="claim.active ? 'i-lucide-circle-check' : 'i-lucide-alert-triangle'"
                        :class="claim.active ? 'text-green-500' : 'text-warning'"
                        :title="$t(claim.active ? 'portsClaimActiveHelp' : 'portsClaimInactiveHelp')"
                        class="size-4 shrink-0"
                    />
                    <span class="flex-1">{{ claim.label }}</span>
                    <UButton
                        v-if="claim.tab"
                        variant="link"
                        size="xs"
                        :label="$t('portsTileConfigure')"
                        @click="switchTab(claim.tab)"
                    />
                </div>
            </UiBox>
        </div>

        <template v-if="canNodes.length">
            <div class="text-sm font-semibold mt-4 mb-2" v-html="$t('portsSectionDronecan')"></div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,22rem))] gap-3">
                <UiBox
                    v-for="node in canNodes"
                    :key="node.nodeId"
                    :type="healthBoxType(node.health)"
                    :title="`${$t('portsTileCanNode')} ${node.nodeId}`"
                >
                    <div class="text-xs">{{ node.name }}</div>
                    <div class="flex items-center gap-2 text-xs">
                        <UIcon
                            :name="node.health === 'OK' ? 'i-lucide-circle-check' : 'i-lucide-alert-triangle'"
                            :class="node.health === 'OK' ? 'text-green-500' : 'text-warning'"
                            class="size-4 shrink-0"
                        />
                        <span
                            >{{ node.health }}<template v-if="node.mode">, {{ node.mode }}</template></span
                        >
                    </div>
                    <div v-if="node.sensors.length" class="text-xs text-dimmed">
                        {{ node.sensors.map((sensor) => sensor.toUpperCase()).join(", ") }}
                    </div>
                </UiBox>
            </div>
        </template>

        <template v-if="sensors.length">
            <div class="text-sm font-semibold mt-4 mb-2" v-html="$t('portsSectionSensors')"></div>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,22rem))] gap-3">
                <UiBox v-for="sensor in sensorTiles" :key="sensor.key" type="neutral" :title="sensor.label">
                    <div class="flex items-center gap-2 text-xs">
                        <UIcon
                            :name="sensor.detected ? 'i-lucide-circle-check' : 'i-lucide-alert-triangle'"
                            :class="sensor.detected ? 'text-green-500' : 'text-warning'"
                            class="size-4 shrink-0"
                        />
                        <span class="flex-1">
                            {{ sensor.hardware }}<template v-if="sensor.bus"> — {{ sensor.bus }}</template>
                        </span>
                    </div>
                    <div v-if="!sensor.detected" class="text-xs text-warning">
                        {{ $t("portsSensorNotDetected") }}
                    </div>
                </UiBox>
            </div>
        </template>
    </template>
</template>

<script setup>
import { computed, nextTick, onMounted } from "vue";
import { useTranslation } from "i18next-vue";
import GUI from "../../../js/gui";
import { switchTab } from "../../../js/tab_switch";
import UiBox from "@/components/elements/UiBox.vue";
import TabLoadingState from "@/components/elements/TabLoadingState.vue";
import { usePeripherals } from "../../../composables/ports/usePeripherals";
import { describeClaim } from "../../../composables/ports/portClaims";

const { t } = useTranslation();

const { isLoading, supported, serialPorts, canNodes, sensors, load } = usePeripherals();

const serialTiles = computed(() =>
    serialPorts.value.map((port) => ({
        ...port,
        claims: port.claims.map((claim) => ({ ...claim, ...describeClaim(claim.name) })),
    })),
);

const sensorClassLabels = {
    gyro: "portsSensorGyro",
    acc: "portsSensorAcc",
    baro: "portsSensorBaro",
    mag: "portsSensorMag",
};

const sensorTiles = computed(() =>
    sensors.value.map((sensor) => {
        const [sensorClass, instance] = sensor.key.split(" ");
        const base = t(sensorClassLabels[sensorClass] ?? sensorClass);
        return { ...sensor, label: instance ? `${base} ${instance}` : base };
    }),
);

function healthBoxType(health) {
    if (health === "OK") {
        return "neutral";
    }
    return health === "WARNING" ? "warning" : "error";
}

onMounted(async () => {
    await load();
    nextTick(() => {
        GUI.content_ready();
    });
});
</script>
