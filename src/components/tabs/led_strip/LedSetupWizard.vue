<!--
This file is part of Betaflight.

Betaflight is free software. You can redistribute this software
and/or modify this software under the terms of the GNU General
Public License as published by the Free Software Foundation,
either version 3 of the License, or (at your option) any later
version.

Betaflight is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU General Public License for more details.

You should have received a copy of the GNU General Public
License along with this software.
If not, see <http://www.gnu.org/licenses/>.
-->
<template>
    <section class="led-setup-wizard" :aria-label="$t('ledWizardTitle')">
        <UiBox v-if="recognizedStripCount !== undefined" type="neutral" highlight>
            <p>{{ $t("ledWizardRecognizedStrip", { count: recognizedStripCount }) }}</p>
        </UiBox>
        <UiBox v-if="custom" type="warning" highlight>
            <strong>{{ $t("ledWizardCustom") }}</strong>
            <p>{{ $t("ledWizardCustomNote") }}</p>
            <UButton variant="link" :label="$t('ledWizardAdvanced')" @click="emit('advanced')" />
        </UiBox>
        <p>{{ $t("ledWizardDraftNote") }}</p>
        <div class="wizard-columns">
            <div class="wizard-fields">
                <UiBox :title="$t('ledWizardBasic')">
                    <UFormField :label="$t('ledWizardTopology')" name="led-wizard-topology">
                        <USelect v-model="topology" :items="topologyItems" class="w-full" />
                    </UFormField>
                    <UFormField
                        :label="$t(model.topology === 'parallel' ? 'ledWizardCountPerArm' : 'ledWizardCount')"
                        name="led-wizard-count"
                        :error="countIssue ? $t(countIssue.key, countIssue.params) : undefined"
                    >
                        <UInputNumber v-model="count" :min="1" :max="maxWizardLeds(source)" :step="1" />
                        <span class="ml-2">{{ $t("ledWizardCapacity", { count: maxWizardLeds(source) }) }}</span>
                    </UFormField>
                    <UFormField :label="$t('ledWizardLayout')" name="led-wizard-layout">
                        <USelect v-model="layout" :items="layoutItems" class="w-full" />
                    </UFormField>
                    <p v-if="model.topology === 'serial'">
                        {{ $t("ledWizardPerArm", { count: Number.isInteger(perArm) ? perArm : "—" }) }}
                    </p>
                    <UFormField :label="$t('ledWizardDirection')" name="led-wizard-direction">
                        <USelect v-model="model.direction" :items="directionItems" class="w-full" />
                    </UFormField>
                    <p>{{ $t("ledWizardPhysicalCount", { count: physicalCount ?? "—" }) }}</p>
                    <p v-if="model.topology === 'parallel'">{{ $t("ledWizardParallelNote") }}</p>
                    <p v-if="model.topology === 'parallel'">{{ $t("ledWizardTopologyReopen") }}</p>
                    <p>{{ $t("ledWizardWiringNote") }}</p>
                </UiBox>
                <UiBox :title="$t('ledWizardStates')">
                    <UFormField :label="$t('ledWizardArmed')" name="led-wizard-armed">
                        <USelect v-model="armed" :items="armedItems" class="w-full" />
                    </UFormField>
                    <UFormField :label="$t('ledWizardArmedColor')" name="led-wizard-armed-color">
                        <USelect v-model="model.armedColor" :items="colorItems" class="w-full" />
                    </UFormField>
                    <UFormField :label="$t('ledWizardDisarmed')" name="led-wizard-disarmed">
                        <USelect v-model="model.disarmed" :items="disarmedItems" class="w-full" />
                    </UFormField>
                    <UFormField
                        v-if="model.disarmed === 'static'"
                        :label="$t('ledWizardDisarmedColor')"
                        name="led-wizard-disarmed-color"
                    >
                        <USelect v-model="model.disarmedColor" :items="colorItems" class="w-full" />
                    </UFormField>
                    <p v-if="model.armed === 'thrust'">{{ $t("ledWizardThrustNote") }}</p>
                </UiBox>
                <UiBox :title="$t('ledWizardWarnings')">
                    <USwitch v-model="model.warnings" :label="$t('ledWizardWarningOverlay')" />
                    <p>{{ $t("ledWizardWarningsNote") }}</p>
                </UiBox>
                <UiBox :title="$t('ledStripBrightnessSliderTitle')">
                    <UFormField
                        v-if="supportsLedBrightness(source)"
                        :label="`${$t('ledStripBrightnessSliderTitle')} ${model.brightness}%`"
                        name="led-wizard-brightness"
                    >
                        <USlider
                            v-model="model.brightness"
                            :min="5"
                            :max="100"
                            :step="1"
                            :aria-label="$t('ledStripBrightnessSliderTitle')"
                        />
                    </UFormField>
                    <p v-else>{{ $t("ledWizardBrightnessUnavailable") }}</p>
                </UiBox>
                <UiBox :title="$t('ledWizardMasterSwitch')">
                    <p>{{ $t("ledWizardMasterSwitchNote") }}</p>
                </UiBox>
            </div>
            <div class="wizard-preview-column">
                <UiBox :title="$t('ledWizardPreview')">
                    <LedWizardPreview
                        :model="model"
                        :color="hsvToColor(source.colors[model.armedColor])"
                        :off="source.colors[model.armedColor]?.v === 0"
                    />
                    <div class="wizard-palette" :aria-label="$t('ledWizardPalette')">
                        <span v-for="(color, index) in source.colors" :key="index" class="palette-entry">
                            <span
                                class="swatch"
                                :class="{ 'swatch-off': color.v === 0 }"
                                :title="color.v === 0 ? $t('off') : colorItems[index]?.label"
                                :style="color.v === 0 ? undefined : { backgroundColor: hsvToColor(color) }"
                            />
                            {{ index }}
                        </span>
                    </div>
                    <p>{{ $t("ledWizardPaletteNote") }}</p>
                </UiBox>
                <UiBox v-if="errors.length" type="warning" highlight>
                    <ul role="alert">
                        <li v-for="error in errors" :key="error">
                            {{ $t(error, { perArm: perArm ?? "—", segment: segment ?? "—" }) }}
                        </li>
                    </ul>
                </UiBox>
                <UButton :disabled="errors.length > 0 || busy" :label="$t('ledWizardReview')" @click="reviewChanges" />
                <UiBox v-if="review" :title="$t(noChanges ? 'ledWizardReview' : 'ledWizardReviewTitle')" highlight>
                    <div aria-live="polite">
                        <p v-if="noChanges">{{ $t("ledWizardNoChanges") }}</p>
                        <template v-else>
                            <p>
                                {{
                                    $t(
                                        model.topology === "parallel"
                                            ? "ledWizardReplaceParallelSummary"
                                            : "ledWizardReplaceSummary",
                                        {
                                            previous: activeCount,
                                            count: countValid ? model.count : "—",
                                            physical: physicalCount ?? "—",
                                        },
                                    )
                                }}
                            </p>
                            <dl class="review-details">
                                <dt>{{ $t("ledWizardTopology") }}</dt>
                                <dd>{{ topologyItems.find((item) => item.value === model.topology)?.label }}</dd>
                                <dt>{{ $t("ledWizardLayout") }}</dt>
                                <dd>{{ layoutItems.find((item) => item.value === model.layout)?.label }}</dd>
                                <dt>{{ $t("ledWizardDirection") }}</dt>
                                <dd>{{ directionItems.find((item) => item.value === model.direction)?.label }}</dd>
                                <dt>{{ $t("ledWizardArmed") }}</dt>
                                <dd>
                                    {{ armedItems.find((item) => item.value === model.armed)?.label }} ·
                                    {{ colorItems.find((item) => item.value === model.armedColor)?.label }}
                                </dd>
                                <dt>{{ $t("ledWizardDisarmed") }}</dt>
                                <dd>
                                    {{ disarmedItems.find((item) => item.value === model.disarmed)?.label
                                    }}<span v-if="model.disarmed === 'static'">
                                        ·
                                        {{ colorItems.find((item) => item.value === model.disarmedColor)?.label }}</span
                                    >
                                </dd>
                                <dt>{{ $t("ledWizardWarnings") }}</dt>
                                <dd>{{ $t(model.warnings ? "on" : "off") }}</dd>
                                <template v-if="supportsLedBrightness(source)"
                                    ><dt>{{ $t("ledStripBrightnessSliderTitle") }}</dt>
                                    <dd>{{ source.configValues.brightness }}% → {{ model.brightness }}%</dd></template
                                >
                            </dl>
                            <p>{{ $t("ledWizardApplyNote") }}</p>
                            <p v-if="model.armed === 'thrust'">{{ $t("ledWizardThrustNote") }}</p>
                        </template>
                    </div>
                    <UButton v-if="!noChanges" :disabled="busy" :label="$t('ledWizardApply')" @click="applyReviewed" />
                </UiBox>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTranslation } from "i18next-vue";
import UiBox from "@/components/elements/UiBox.vue";
import LedWizardPreview from "./LedWizardPreview.vue";
import { useLedSetupWizard } from "@/composables/useLedSetupWizard";
import { useLedStrip } from "@/composables/useLedStrip";
import {
    ledsPerArm,
    physicalLedCount,
    ringSeqLen,
    isEmptyLed,
    maxWizardLeds,
    supportsLedBrightness,
    type LedWizardModel,
} from "@/composables/ledWizard";

defineProps<{ busy: boolean }>();
const emit = defineEmits<{ applied: []; advanced: [] }>();
const { t } = useTranslation();
const {
    source,
    model,
    topology,
    count,
    countIssue,
    armed,
    errors,
    custom,
    recognizedStripCount,
    review,
    noChanges,
    reviewChanges,
    apply,
} = useLedSetupWizard();
const { hsvToColor } = useLedStrip();
const countValid = computed(() => !errors.value.includes("ledWizardErrorCount"));
const perArm = computed(() => (countValid.value ? ledsPerArm(model.value) : undefined));
const physicalCount = computed(() => (countValid.value ? physicalLedCount(model.value) : undefined));
const segment = computed(() =>
    countValid.value && model.value.count !== undefined ? ringSeqLen(model.value.count) : undefined,
);
const activeCount = computed(() => source.value.strip.filter((led) => !isEmptyLed(led)).length);
const layout = computed({
    get: (): LedWizardModel["layout"] | "advanced" => model.value.layout,
    set: (value: LedWizardModel["layout"] | "advanced") => {
        if (value === "advanced") emit("advanced");
        else model.value.layout = value;
    },
});
const topologyItems = computed(() => [
    { value: "serial", label: t("ledWizardSerial") },
    { value: "parallel", label: t("ledWizardParallel") },
]);
const layoutItems = computed(() => [
    { value: "strip", label: t("ledWizardStrip") },
    { value: "two", label: t("ledWizardTwo") },
    { value: "four", label: t("ledWizardFour") },
    { value: "advanced", label: t("ledWizardCustomLayout") },
]);
const directionItems = computed(() => [
    { value: "outward", label: t("ledWizardOutward") },
    { value: "inward", label: t("ledWizardInward") },
]);
const armedItems = computed(() => [
    { value: "static", label: t("ledWizardStatic") },
    { value: "thrust", label: t("ledWizardThrust") },
]);
const disarmedItems = computed(() =>
    model.value.armed === "thrust"
        ? [{ value: "firmware", label: t("ledWizardFirmwarePattern") }]
        : [
              { value: "off", label: t("off") },
              { value: "static", label: t("ledWizardStatic") },
          ],
);
const colorNames: Record<number, string> = {
    0: "colorRed",
    15: "colorOrange",
    50: "colorYellow",
    100: "colorLimeGreen",
    115: "colorGreen",
    125: "colorMintGreen",
    180: "colorCyan",
    210: "colorLightBlue",
    240: "colorBlue",
    270: "colorDarkViolet",
    300: "colorMagenta",
    330: "colorDeepPink",
};
const colorItems = computed(() =>
    source.value.colors.slice(0, 16).map((color, value) => {
        const name =
            color.v === 0
                ? "colorBlack"
                : color.s === 255
                  ? "colorWhite"
                  : color.s === 0
                    ? colorNames[color.h]
                    : undefined;
        return {
            value,
            label: name ? `${t(name)} (${value})` : t("ledWizardColorSlot", { index: value, hue: color.h }),
        };
    }),
);
function applyReviewed() {
    if (apply()) emit("applied");
}
</script>

<style lang="less">
.led-setup-wizard {
    display: grid;
    gap: 1rem;
    .wizard-columns {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 1.5rem;
        align-items: start;
    }
    .wizard-fields,
    .wizard-preview-column {
        display: grid;
        gap: 1rem;
        min-width: 0;
    }
    .wizard-preview-column {
        position: sticky;
        top: 1rem;
    }
    .wizard-palette {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
    }
    .palette-entry {
        display: inline-flex;
        flex: 0 0 auto;
        white-space: nowrap;
        min-width: 2.75rem;
        align-items: center;
        gap: 0.25rem;
    }
    .swatch {
        flex: 0 0 1rem;
        position: relative;
        width: 1rem;
        height: 1rem;
        border-radius: 50%;
        border: 1px solid var(--text);
    }
    .swatch-off {
        background: var(--surface-100);
        &::after {
            content: "";
            position: absolute;
            top: 45%;
            left: 0;
            width: 100%;
            border-top: 2px solid var(--text);
            transform: rotate(-45deg);
        }
    }
    .review-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
    }
    dt {
        font-weight: 600;
    }
    ul {
        padding-inline-start: 1.25rem;
        list-style: disc;
    }
    @media (max-width: 850px) {
        .wizard-columns {
            grid-template-columns: 1fr;
        }
        .wizard-preview-column {
            position: static;
        }
    }
}
</style>
