<template>
    <BaseTab tab-name="cli" @mounted="onTabMounted" @cleanup="onTabCleanup">
        <div class="content_wrapper cli-content">
            <div class="note">
                <p v-html="$t('cliInfo')"></p>
            </div>

            <div class="cli-backdrop">
                <div ref="cliWindowRef" class="cli-window">
                    <div ref="windowWrapperRef" class="cli-wrapper"></div>
                </div>
            </div>
            <div class="relative mt-2">
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
                    class="cli-command-input"
                    @keydown="cli.handleCommandKeyDown"
                    @keypress="cli.handleCommandKeyPress"
                    @keyup="cli.handleCommandKeyUp"
                    @input="onInputChange"
                ></textarea>
            </div>
        </div>

        <!-- Snippet preview dialog -->
        <dialog ref="snippetPreviewDialogRef" closedby="any" class="w-[600px] h-fit">
            <div class="p-4">
                <div class="note mb-3">
                    <p v-html="$t('cliConfirmSnippetNote')"></p>
                </div>
                <textarea v-model="cli.state.snippetPreview" rows="20" class="cli-snippet-preview"></textarea>
                <div class="mt-3">
                    <UButton :label="$t('cliConfirmSnippetBtn')" @click="handleSnippetConfirm" />
                </div>
            </div>
        </dialog>

        <!-- Support warning dialog -->
        <dialog ref="supportWarningDialogRef" class="w-[400px] h-fit">
            <div class="p-4">
                <h3 class="font-semibold mb-2">{{ $t("supportWarningDialogTitle") }}</h3>
                <div class="mb-3" v-html="$t('supportWarningDialogText')"></div>
                <textarea
                    v-model="cli.state.supportDialogInput"
                    name="supportWarningDialogInput"
                    :placeholder="$t('supportWarningDialogInputPlaceHolder')"
                    rows="3"
                    cols="0"
                    class="w-full mt-2 h-[22px] leading-5 pl-1 border border-(--ui-border) resize-none bg-(--ui-bg-muted) text-(--ui-text)"
                ></textarea>
                <div class="flex gap-2 mt-3">
                    <UButton :label="$t('submit')" @click="handleSupportSubmit" />
                    <UButton :label="$t('cancel')" variant="outline" @click="handleSupportCancel" />
                </div>
            </div>
        </dialog>

        <!-- Bottom toolbar -->
        <div class="content_toolbar xs-compressed toolbar_fixed_bottom">
            <div class="toolbar_expand_btn" nbrow="2">
                <em class="fas fa-ellipsis-h"></em>
            </div>
            <UButton :label="$t('cliSaveToFileBtn')" @click="cli.saveFile" />
            <UButton :label="$t('cliLoadFromFileBtn')" @click="handleLoadFile" />
            <UButton :label="$t('cliClearOutputHistoryBtn')" @click="cli.clearHistory" />
            <UButton
                :label="cli.state.copyButtonText"
                :style="{ minWidth: cli.state.copyButtonWidth }"
                @click="cli.copyToClipboard"
            />
            <UButton
                v-if="cli.isSupportRequestAvailable()"
                :label="$t('cliSupportRequestBtn')"
                @click="cli.submitSupportRequest"
            />
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

<style>
/* Terminal-specific styles — unscoped because .cli-wrapper children are runtime-generated */
.tab-cli {
    height: calc(100% - 6rem);
}

.tab-cli .cli-content {
    flex-direction: column;
    display: flex;
    overflow: hidden;
}

.tab-cli .cli-backdrop {
    border: 1px solid var(--surface-500);
    background-color: rgba(0, 0, 0, 0.75);
    flex-grow: 1;
    background-image: url("../../images/light-wide-1.svg");
    background-repeat: no-repeat;
    background-position: 50% 80%;
    background-size: 600px;
    border-radius: 5px;
    box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
    width: 100%;
}

.tab-cli .cli-window {
    height: 100%;
    width: 100%;
    padding: 5px;
    overflow-y: scroll;
    overflow-x: hidden;
    font-family: monospace;
    color: white;
    box-sizing: border-box;
}

.tab-cli .cli-wrapper {
    user-select: text;
    white-space: pre-wrap;
    height: 0px;
}

.tab-cli .cli-wrapper > * {
    user-select: text;
}

/* Runtime-generated syntax highlighting — one-dark-pro palette */
.tab-cli .cli-window .error_message {
    color: red;
    font-weight: bold;
}

.tab-cli .cli-window .cli-comment {
    color: #7f848e;
}

.tab-cli .cli-window .cli-cmd,
.tab-cli .cli-window .cli-label {
    color: #61afef;
}

.tab-cli .cli-window .cli-num {
    color: #e5c07b;
}

.tab-cli .cli-command-input {
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

.tab-cli .cli-snippet-preview {
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

@media only screen and (max-width: 1055px) {
    .tab-cli .cli-content {
        height: calc(100% - 87px);
    }
}

@media all and (max-width: 575px) {
    .tab-cli .cli-backdrop {
        background-size: 100%;
    }
}
</style>
