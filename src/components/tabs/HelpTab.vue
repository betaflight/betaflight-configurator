<template>
    <BaseTab tab-name="help">
        <div class="content_wrapper grid-row">
            <div class="grid-col col8">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title" v-html="$t('defaultDocumentationHead')"></div>
                    </div>
                    <div class="spacer">
                        <p v-html="$t('defaultDocumentation')"></p>
                        <ul>
                            <li>
                                <span v-html="$t('defaultDocumentation1')"></span>
                            </li>
                            <li>
                                <span v-html="$t('defaultDocumentation2')"></span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="grid-col col4">
                <div class="gui_box">
                    <div class="gui_box_titlebar">
                        <div class="spacer_box_title" v-html="$t('defaultSupportHead')"></div>
                    </div>
                    <div class="spacer">
                        <p v-html="$t('defaultSupport')"></p>
                        <div class="subline">
                            <strong v-html="$t('defaultSupportSubline1')"></strong>
                        </div>
                        <ul>
                            <li>
                                <span v-html="$t('defaultSupport1')"></span>
                            </li>
                            <li>
                                <span v-html="$t('defaultSupport2')"></span>
                            </li>
                            <li>
                                <span v-html="$t('defaultSupport3')"></span>
                            </li>
                        </ul>
                        <div class="subline">
                            <strong v-html="$t('defaultSupportSubline2')"></strong>
                        </div>
                        <ul>
                            <li>
                                <span v-html="$t('defaultSupport4')"></span>
                            </li>
                            <li>
                                <span v-html="$t('defaultSupport5')"></span>
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

<style lang="less">
.tab-help {
    .gui_box {
        min-height: 500px;
        margin-bottom: 0;
    }
    ul {
        margin-bottom: 15px;
    }
    li {
        border-top: 1px dotted var(--surface-500);
        padding-top: 5px;
        padding-bottom: 5px;
        background-image: url(../../images/arrow.svg);
        background-repeat: no-repeat;
        background-position: 0 8px;
        background-size: 12px;
        span {
            margin-left: 17px;
            display: block;
            a {
                color: var(--primary-500);
            }
        }
    }
    .subline {
        margin-bottom: 5px;
    }
}
/** (phones) **/
@media all and (max-width: 575px) {
    .tab-help {
        .gui_box {
            min-height: auto;
            margin-bottom: 15px;
        }
    }
}
</style>
