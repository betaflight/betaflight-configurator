import { createApp, h, nextTick, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import PresetDetailsDialog from "../../src/components/tabs/presets/PresetDetailsDialog.vue";

function mountWithProps(component, initialProps, listeners = {}) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const props = reactive({ ...initialProps });

    const app = createApp({
        render() {
            return h(component, { ...props, ...listeners });
        },
    });

    app.config.globalProperties.$t = (key) => key;
    app.mount(container);

    return {
        container,
        app,
        props,
        async setProps(nextProps) {
            Object.assign(props, nextProps);
            await nextTick();
            await nextTick();
        },
        unmount() {
            app.unmount();
            container.remove();
        },
    };
}

describe("PresetDetailsDialog", () => {
    let wrapper;

    afterEach(() => {
        wrapper?.unmount();
        wrapper = null;
        document.body.innerHTML = "";
        vi.restoreAllMocks();
    });

    it("renders markdown descriptions safely and emits option changes", async () => {
        const onToggleOption = vi.fn();
        wrapper = mountWithProps(
            PresetDetailsDialog,
            {
                open: true,
                loading: false,
                error: "",
                showCli: false,
                showRepositoryName: true,
                selectedOptionIds: ["0"],
                selectedOptionLabels: ["Option A"],
                optionsExpanded: true,
                cliStrings: ["set foo = on"],
                isFavorite: false,
                isPicked: false,
                repository: {
                    getPresetOnlineLink: () => "https://example.com/preset-a.txt",
                    official: true,
                    name: "Betaflight Official Presets",
                },
                preset: {
                    title: "Preset A",
                    status: "OFFICIAL",
                    category: "Frames",
                    author: "Eric",
                    firmware_version: ["4.5"],
                    keywords: ["freestyle"],
                    description: ["# Heading", "Visit [Betaflight](https://betaflight.com)"],
                    discussion: "ftp://example.com/preset-discussion",
                    parser: "MARKED",
                    options: [{ id: "0", name: "Option A", checked: true }],
                },
            },
            {
                onToggleOption,
            },
        );

        await nextTick();

        const htmlBlock = wrapper.container.querySelector('[data-testid="preset-html-description"]');
        expect(htmlBlock.innerHTML).toContain("<h1");
        expect(htmlBlock.querySelector("a").getAttribute("target")).toBe("_blank");
        const discussionBtn = wrapper.container.querySelector('[data-testid="preset-discussion-link"]');
        expect(discussionBtn).toBeTruthy();
        expect(discussionBtn.hasAttribute("href")).toBe(false);

        const checkbox = wrapper.container.querySelector('input[type="checkbox"]');
        checkbox.checked = false;
        checkbox.dispatchEvent(new Event("change"));

        expect(onToggleOption).toHaveBeenCalledWith({ optionId: "0", checked: false });
    });
});
