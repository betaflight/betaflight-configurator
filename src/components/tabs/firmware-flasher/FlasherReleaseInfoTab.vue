<template>
    <UiBox class="release_info col-span-1 mt-6">
        <div class="release_info_grid">
            <!-- Target Row -->
            <div class="info_row">
                <strong>{{ $t("firmwareFlasherReleaseTarget") }}</strong>
                <span class="target">{{ state.targetSpanText }}</span>
                <div class="board_support">
                    <UButton size="xs" variant="soft" :to="state.targetSupportUrl" target="_blank">{{
                        $t("betaflightSupportButton")
                    }}</UButton>
                </div>
            </div>

            <!-- Manufacturer Row (conditional) -->
            <div v-if="state.manufacturerInfoVisible" class="info_row">
                <strong>{{ $t("firmwareFlasherReleaseManufacturer") }}</strong>
                <span id="manufacturer">{{ state.manufacturerSpanText }}</span>
                <div></div>
            </div>

            <!-- Version Row -->
            <div class="info_row">
                <strong>{{ $t("firmwareFlasherReleaseVersion") }}</strong>
                <a
                    :title="$t('firmwareFlasherReleaseVersionUrl')"
                    class="name"
                    :href="state.releaseNameLink"
                    target="_blank"
                    >{{ state.releaseNameText }}</a
                >
                <div></div>
            </div>

            <!-- MCU Row -->
            <div class="info_row">
                <strong>{{ $t("firmwareFlasherReleaseMCU") }}</strong>
                <span id="targetMCU">{{ state.targetMCUText }}</span>
                <div></div>
            </div>

            <!-- Date Row -->
            <div class="info_row">
                <strong>{{ $t("firmwareFlasherReleaseDate") }}</strong>
                <span class="date">{{ state.releaseDateText }}</span>
                <div></div>
            </div>

            <!-- Configuration File Row -->
            <div class="info_row">
                <strong>{{ $t("firmwareFlasherConfigurationFile") }}</strong>
                <span class="configFilename">{{ state.configFilenameText }}</span>
                <div></div>
            </div>

            <!-- Cloud Details Row -->
            <div class="info_row">
                <strong>{{ $t("firmwareFlasherCloudBuildDetails") }}</strong>
                <a
                    :title="$t('firmwareFlasherCloudBuildLogUrl')"
                    id="cloudTargetLog"
                    :href="cloudBuild.state.cloudTargetLogUrl"
                    target="_blank"
                    >{{ cloudBuild.state.cloudTargetLogText }}</a
                >
                <div></div>
            </div>

            <!-- Cloud Status Row -->
            <div class="info_row">
                <strong>{{ $t("firmwareFlasherCloudBuildStatus") }}</strong>
                <div class="status_wrapper">
                    <progress
                        :ref="cloudBuild.buildProgressBar"
                        class="buildProgress"
                        value="0"
                        min="0"
                        max="100"
                        :aria-label="$t('firmwareFlasherCloudBuildStatus')"
                    ></progress>
                </div>
                <div>
                    <UButton
                        v-if="!cloudBuild.state.cancelBuildButtonDisabled"
                        size="xs"
                        variant="soft"
                        @click="cloudBuild.handleCancelBuild"
                        >{{ $t("cancel") }}</UButton
                    >
                    <span v-else id="cloudTargetStatus">
                        {{ cloudBuild.state.cloudTargetStatusText }}
                    </span>
                </div>
            </div>

            <!-- Firmware Loaded Rows (online only) -->
            <div v-if="state.firmwareLoadedName && !state.firmwareLoadedIsLocal" class="info_row">
                <strong>{{ $t("firmwareFlasherFirmwareLoaded") }}</strong>
                <span>{{ state.firmwareLoadedSize }}</span>
                <div>
                    <UButton size="xs" variant="soft" @click="onSaveFirmware">{{ $t("save") }}</UButton>
                </div>
            </div>
        </div>
    </UiBox>
</template>

<script setup>
import UiBox from "@/components/elements/UiBox.vue";

defineProps({
    state: { type: Object, required: true },
    cloudBuild: { type: Object, required: true },
    onSaveFirmware: { type: Function, required: true },
});
</script>

<style scoped>
.release_info_grid {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1rem 2rem;
    align-items: center;
}

.release_info_grid .info_row {
    display: contents;
}

.release_info_grid strong {
    text-align: right;
    white-space: nowrap;
    padding-right: 1rem;
}

.release_info_grid span,
.release_info_grid a {
    text-align: left;
}

.release_info_grid .board_support {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-self: start;
}

.status_wrapper {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.buildProgress {
    border-radius: 4px;
    appearance: none;
    -webkit-appearance: none;
    overflow: hidden;
}

.buildProgress::-webkit-progress-bar {
    background-color: var(--surface-500);
}

.buildProgress::-webkit-progress-value {
    background-color: var(--primary-500);
    border-radius: 0 4px 4px 0;
}
</style>
