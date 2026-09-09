<template>
    <BaseTab tab-name="help">
        <div class="content_wrapper">
            <div class="tab_title">{{ $t("tabHelp") }}</div>
            <div class="grid-row grid-box col5">
                <div class="col-span-3">
                    <UiBox :title="$t('defaultDocumentationHead')" type="neutral" collapsible class="sm:h-full">
                        <p v-html="$t('defaultDocumentation')"></p>
                        <ul>
                            <li>
                                <span v-html="$t('defaultDocumentation1')"></span>
                            </li>
                            <li>
                                <span v-html="$t('defaultDocumentation2')"></span>
                            </li>
                        </ul>
                    </UiBox>
                </div>
                <div class="col-span-2">
                    <UiBox :title="$t('defaultSupportHead')" type="neutral" collapsible class="sm:h-full">
                        <p v-html="$t('defaultSupport')"></p>
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
                    </UiBox>
                </div>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent } from "vue";
import BaseTab from "./BaseTab.vue";
import GUI from "../../js/gui";
import UiBox from "../elements/UiBox.vue";

export default defineComponent({
    name: "HelpTab",
    components: {
        BaseTab,
        UiBox,
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
    ul {
        margin-bottom: 15px;
    }

    li {
        border-top: 1px dotted var(--surface-500);
        padding-top: 5px;
        padding-bottom: 5px;
        position: relative;

        &::before {
            content: "";
            position: absolute;
            inset-inline-start: 0;
            top: 8px;
            width: 12px;
            height: 12px;
            background: url(../../images/arrow.svg) no-repeat;
            background-size: 12px;
        }

        span {
            margin-inline-start: 17px;
            display: block;

            a {
                color: var(--primary-500);
            }
        }
    }

    html[dir="rtl"] & li::before {
        transform: scaleX(-1);
    }

    .subline {
        margin-bottom: 5px;
    }

    @media all and (max-width: 575px) {
        .grid-box {
            &.col5 {
                grid-template-columns: 1fr !important;
            }
            .col-span-2 {
                grid-column: span 1;
            }
            .col-span-3 {
                grid-column: span 1;
            }
        }
    }
}
</style>
