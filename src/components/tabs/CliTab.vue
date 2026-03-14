<template>
    <BaseTab tab-name="cli" @mounted="onTabMounted" @cleanup="onTabCleanup">
        <div class="content_wrapper">
            <div class="note">
                <p v-html="$t('cliInfo')"></p>
            </div>

            <div class="backdrop">
                <div ref="cliWindowRef" class="window">
                    <div ref="windowWrapperRef" class="wrapper"></div>
                </div>
            </div>
            <div class="cli-input-wrapper">
                <CliAutocompleteDropdown
                    :items="cli.autocomplete.items.value"
                    :visible="cli.autocomplete.visible.value"
                    :active-index="cli.autocomplete.activeIndex.value"
                    :caret-left="cli.autocomplete.caretLeft.value"
                    @select="onAutocompleteSelect"
                    @hover="cli.autocomplete.activeIndex.value = $event"
                />
                <textarea
                    ref="commandInputRef"
                    v-model="cli.state.commandInput"
                    name="commands"
                    :placeholder="$t('cliInputPlaceholder')"
                    rows="1"
                    cols="0"
                    @keydown="cli.handleCommandKeyDown"
                    @keypress="cli.handleCommandKeyPress"
                    @keyup="cli.handleCommandKeyUp"
                    @input="onInputChange"
                ></textarea>
            </div>
        </div>

        <!-- Snippet preview dialog -->
        <dialog ref="snippetPreviewDialogRef" closedby="any" id="snippetpreviewdialog" class="html-dialog">
            <div id="snippetpreviewcontent" class="html-dialog-content">
                <div class="note">
                    <p v-html="$t('cliConfirmSnippetNote')"></p>
                </div>
                <textarea id="preview" v-model="cli.state.snippetPreview" rows="20"></textarea>
                <div class="default_btn">
                    <a class="confirm" href="#" @click.prevent="handleSnippetConfirm">{{
                        $t("cliConfirmSnippetBtn")
                    }}</a>
                </div>
            </div>
        </dialog>

        <!-- Support warning dialog -->
        <dialog ref="supportWarningDialogRef" class="supportWarningDialog">
            <h3>{{ $t("supportWarningDialogTitle") }}</h3>
            <div class="content">
                <div v-html="$t('supportWarningDialogText')"></div>
                <div>
                    <textarea
                        v-model="cli.state.supportDialogInput"
                        name="supportWarningDialogInput"
                        :placeholder="$t('supportWarningDialogInputPlaceHolder')"
                        rows="3"
                        cols="0"
                    ></textarea>
                </div>
            </div>
            <div class="buttons">
                <a class="submit regular-button" href="#" @click.prevent="handleSupportSubmit">{{ $t("submit") }}</a>
                <a class="cancel regular-button" href="#" @click.prevent="handleSupportCancel">{{ $t("cancel") }}</a>
            </div>
        </dialog>

        <!-- Bottom toolbar -->
        <div class="content_toolbar xs-compressed toolbar_fixed_bottom">
            <div class="toolbar_expand_btn" nbrow="2">
                <em class="fas fa-ellipsis-h"></em>
            </div>
            <div class="btn save_btn">
                <button type="button" class="save" @click="cli.saveFile">{{ $t("cliSaveToFileBtn") }}</button>
            </div>
            <div class="btn save_btn">
                <button type="button" class="load" @click="handleLoadFile">{{ $t("cliLoadFromFileBtn") }}</button>
            </div>
            <div class="btn save_btn">
                <button type="button" class="clear" @click="cli.clearHistory">
                    {{ $t("cliClearOutputHistoryBtn") }}
                </button>
            </div>
            <div class="btn save_btn">
                <button
                    type="button"
                    class="copy"
                    :style="{ width: cli.state.copyButtonWidth, textAlign: cli.state.copyButtonWidth ? 'center' : '' }"
                    @click="cli.copyToClipboard"
                >
                    {{ cli.state.copyButtonText }}
                </button>
            </div>
            <div v-if="cli.isSupportRequestAvailable()" class="btn save_btn">
                <button type="button" class="support" @click="cli.submitSupportRequest">
                    {{ $t("cliSupportRequestBtn") }}
                </button>
            </div>
        </div>
    </BaseTab>
</template>

<script>
import { defineComponent, nextTick } from "vue";
import BaseTab from "./BaseTab.vue";
import CliAutocompleteDropdown from "../cli/CliAutocompleteDropdown.vue";
import { useCli } from "../../composables/useCli";
import { TABS } from "../../js/gui";
import CliAutoComplete from "../../js/CliAutoComplete";
import { EventBus } from "../eventBus";
import { i18n } from "../../js/localization";

export default defineComponent({
    name: "CliTab",
    components: {
        BaseTab,
        CliAutocompleteDropdown,
    },
    setup() {
        const cli = useCli();

        let snippetExecuteCallback = null;

        const onBuildStart = () => {
            if (cli.commandInputRef.value) {
                cli.state.commandInput = "";
                cli.commandInputRef.value.placeholder = i18n.getMessage("cliInputPlaceholderBuilding");
                cli.commandInputRef.value.disabled = true;
            }
        };

        const onBuildStop = () => {
            if (cli.commandInputRef.value) {
                cli.commandInputRef.value.placeholder = i18n.getMessage("cliInputPlaceholder");
                cli.commandInputRef.value.disabled = false;
                cli.commandInputRef.value.focus();
            }
            // Initialize autocomplete strategies now that cache is ready
            cli.autocomplete.initStrategies();
        };

        const onTabMounted = async () => {
            // Set up autocomplete event handlers BEFORE initialize
            // to avoid missing the build:stop event
            EventBus.$on("autocomplete:build:start", onBuildStart);
            EventBus.$on("autocomplete:build:stop", onBuildStop);

            // Register the serial read handler and cleanup on TABS.cli.
            // vue_tab_mounter.js merges these with the tab adapter after mount,
            // preserving component-set properties like read and cleanup.
            if (!TABS.cli) {
                TABS.cli = {};
            }
            TABS.cli.read = cli.read;
            TABS.cli.cleanup = (callback) => {
                cli.cleanup();
                if (callback) {
                    callback();
                }
            };

            await cli.initialize();

            // Focus on command input
            await nextTick();
            if (cli.commandInputRef.value) {
                cli.commandInputRef.value.focus();
            }

            // Adapt for mobile
            handleResize();
            window.addEventListener("resize", handleResize);
        };

        const onTabCleanup = () => {
            // First, clean up the CLI to set CONFIGURATOR.cliActive = false
            // This prevents serial_backend from trying to call TABS.cli.read()
            cli.cleanup();

            // Remove read handler from TABS.cli
            if (TABS.cli && TABS.cli.read === cli.read) {
                delete TABS.cli.read;
            }

            // Remove event listeners
            EventBus.$off("autocomplete:build:start", onBuildStart);
            EventBus.$off("autocomplete:build:stop", onBuildStop);

            window.removeEventListener("resize", handleResize);
        };

        const handleResize = () => {
            if (window.innerWidth < 575) {
                // Mobile adaptation - handled via CSS primarily
                // Additional logic can be added here if needed
            }
        };

        const handleLoadFile = async () => {
            snippetExecuteCallback = await cli.loadFile();
        };

        const handleSnippetConfirm = () => {
            if (snippetExecuteCallback) {
                snippetExecuteCallback();
                snippetExecuteCallback = null;
            }
        };

        const handleSupportSubmit = () => {
            cli.handleSupportDialogSubmit();
        };

        const handleSupportCancel = () => {
            cli.handleSupportDialogCancel();
        };

        const onInputChange = () => {
            if (CliAutoComplete.isEnabled() && !CliAutoComplete.isBuilding()) {
                cli.autocomplete.update(cli.state.commandInput);
            }
        };

        const onAutocompleteSelect = (index) => {
            cli.autocomplete.selectItem(index);
            // Mouse click only applies the replacement, does not send the command.
            // Refocus the textarea so the user can continue typing.
            if (cli.commandInputRef.value) {
                cli.commandInputRef.value.focus();
            }
        };

        return {
            cli,
            onTabMounted,
            onTabCleanup,
            handleLoadFile,
            handleSnippetConfirm,
            handleSupportSubmit,
            handleSupportCancel,
            onInputChange,
            onAutocompleteSelect,
            // Expose refs directly so Vue can assign template refs
            windowWrapperRef: cli.windowWrapperRef,
            cliWindowRef: cli.cliWindowRef,
            commandInputRef: cli.commandInputRef,
            snippetPreviewDialogRef: cli.snippetPreviewDialogRef,
            supportWarningDialogRef: cli.supportWarningDialogRef,
        };
    },
});
</script>

<style scoped>
.tab-cli {
    height: calc(100% - 6rem);
}

.content_wrapper {
    flex-direction: column;
    display: flex;
    overflow-x: hidden;
    overflow-y: hidden;
}

p {
    padding: 0;
    border: 0 dotted var(--surface-500);
}

.backdrop {
    border: 1px solid var(--surface-500);
    background-color: rgba(0, 0, 0, 0.75);
    margin-top: 0;
    flex-grow: 1;
    background-image: url("../../images/light-wide-1.svg");
    background-repeat: no-repeat;
    background-position: 50% 80%;
    background-size: 600px;
    border-radius: 5px;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
    width: 100%;
}

.window {
    height: 100%;
    width: 100%;
    padding: 5px;
    overflow-y: scroll;
    overflow-x: hidden;
    font-family: monospace;
    color: white;
    box-sizing: border-box;
    float: left;
}

.wrapper {
    user-select: text;
    white-space: pre-wrap;
    height: 0px;
}

.wrapper > * {
    user-select: text;
}

.window :deep(.error_message) {
    color: red;
    font-weight: bold;
}

/* Syntax highlighting — one-dark-pro palette */
.window :deep(.cli-comment) {
    color: #7f848e;
}

.window :deep(.cli-cmd),
.window :deep(.cli-label) {
    color: #61afef;
}

.window :deep(.cli-num) {
    color: #e5c07b;
}

.cli-input-wrapper {
    position: relative;
    margin-top: 8px;
}

textarea[name="commands"] {
    box-sizing: border-box;
    width: 100%;
    height: 22px;
    line-height: 20px;
    padding-left: 5px;
    border: 1px solid var(--surface-500);
    resize: none;
    background-color: var(--surface-200);
    color: var(--surface-900);
}

textarea[name="supportWarningDialogInput"] {
    -webkit-box-sizing: border-box;
    width: 100%;
    margin-top: 8px;
    height: 22px;
    line-height: 20px;
    padding-left: 5px;
    border: 1px solid var(--surface-500);
    resize: none;
    background-color: var(--surface-400);
    color: var(--text);
}

#content-watermark {
    z-index: 0;
}

.save {
    color: white;
}

textarea#preview {
    background-color: rgba(0, 0, 0, 0.75);
    width: 100%;
    resize: none;
    overflow-y: scroll;
    overflow-x: hidden;
    font-family: monospace;
    color: white;
    box-sizing: border-box;
    padding: 5px;
    margin-bottom: 5px;
}

/* Fixed toolbar positioning */
:deep(.toolbar_fixed_bottom.content_toolbar) {
    width: calc(100% - 18rem) !important;
}

:deep(.content_toolbar) {
    width: fit-content;
    background-color: var(--surface-300);
    box-shadow: rgba(0, 0, 0, 0.1) 0 -0.5rem 0.5rem;
    display: flex;
    align-items: center;
    justify-content: end;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0.75rem 1rem;
    border-top-left-radius: 1.5rem;

    &::before {
        width: 1.5rem;
        aspect-ratio: 1;
        content: "";
        mask: url(../../images/corner.svg);
        background-color: var(--surface-300);
        position: absolute;
        left: -1.5rem;
        bottom: 0;
    }
}

@media only screen and (max-width: 1055px) {
    .content_wrapper {
        height: calc(100% - 87px);
    }
}

@media only screen and (max-device-width: 1055px) {
    .content_wrapper {
        height: calc(100% - 87px);
    }
}

@media all and (max-width: 575px) {
    .backdrop {
        background-size: 100%;
    }
}
</style>
