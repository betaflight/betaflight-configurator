<template>
    <BaseTab tab-name="ports">
        <template v-if="tilesView">
            <div class="content_wrapper">
                <div class="tab_title" v-html="$t('tabPorts')"></div>
                <WikiButton docUrl="ports" />
                <PortsTilesView />
            </div>
        </template>
        <PortsLegacyView v-else />
    </BaseTab>
</template>

<script setup>
import BaseTab from "./BaseTab.vue";
import WikiButton from "../elements/WikiButton.vue";
import PortsTilesView from "./ports/PortsTilesView.vue";
import PortsLegacyView from "./ports/PortsLegacyView.vue";
import { usePortsReadOnly } from "../../composables/ports/usePortsReadOnly";

// From API 1.49 ports are assigned from the feature tabs and the function mask
// left the wire, so the tab shows the per-device tiles inventory instead of
// the writable per-port table older firmware keeps.
const tilesView = usePortsReadOnly();
</script>
