<template>
    <BaseTab tab-name="help">
        <div class="content_wrapper grid-row">
            <div class="grid-col col8">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title">{{ $t("defaultDocumentationHead") }}</div>
                    </div>
                    <div class="spacer">
                        <p>{{ $t("defaultDocumentation") }}</p>
                        <ul>
                            <li>
                                <span>{{ $t("defaultDocumentation1") }}</span>
                            </li>
                            <li>
                                <span>{{ $t("defaultDocumentation2") }}</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="grid-col col4">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title">{{ $t("defaultSupportHead") }}</div>
                    </div>
                    <div class="spacer">
                        <p>{{ $t("defaultSupport") }}</p>
                        <div class="subline">
                            <strong>{{ $t("defaultSupportSubline1") }}</strong>
                        </div>
                        <ul>
                            <li>
                                <span>{{ $t("defaultSupport1") }}</span>
                            </li>
                            <li>
                                <span>{{ $t("defaultSupport2") }}</span>
                            </li>
                            <li>
                                <span>{{ $t("defaultSupport3") }}</span>
                            </li>
                        </ul>
                        <div class="subline">
                            <strong>{{ $t("defaultSupportSubline2") }}</strong>
                        </div>
                        <ul>
                            <li>
                                <span>{{ $t("defaultSupport4") }}</span>
                            </li>
                            <li>
                                <span>{{ $t("defaultSupport5") }}</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";

export default defineComponent({
    name: "HelpTab",
    components: {
        BaseTab,
    },
    setup() {
        // Called after tab is ready - equivalent to old content_ready callback
        function onTabReady() {
            GUI.content_ready();
        }

        return { onTabReady };
    },
    mounted() {
        this.onTabReady();
    },
});
</script>

<style scoped>
/* Inherit styles from existing help.html via global CSS */
</style>
