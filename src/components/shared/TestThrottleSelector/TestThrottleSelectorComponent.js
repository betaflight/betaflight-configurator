"use strict";

class TestThrottleSelectorComponent {
    static get containerPath() { return "./components/shared/TestThrottleSelector/container.html"; }
    static get itemPath() { return "./components/shared/TestThrottleSelector/item.html"; }

    /** @type {Array<number>} */
    static get defaultOptions() { return [5, 10, 15, 20]; }

    /**
     * @param {HTMLElement} rootElement
     * @param {Array<number>} options
     * @param {number} selectedIndex
     */
    constructor(rootElement, options, selectedIndex) {
        this.$root = rootElement;
        this.options = options || TestThrottleSelectorComponent.defaultOptions;
        this._selectedIndex = selectedIndex || 0;
        this._domButtons = [];
        this._onSelected = undefined; // fun(value) where `value` is 1000-2000
    }

    /**
     * @param {HTMLElement} targetEl Target element for the component
     * @param {Array<number>} options Throttle value options (between 0-100)
     * @param {number} selectedIndex Index of default option (default: 0)
     * @returns {TestThrottleSelectorComponent}
     */
    static before(targetEl, options, selectedIndex) {
        return (new TestThrottleSelectorComponent(targetEl, options, selectedIndex)).mountPrepend();
    }

    /**
     * @returns {TestThrottleSelectorComponent}
     */
    mountPrepend() {
        return this._mount('prepend');
    }

    /**
     * @returns {TestThrottleSelectorComponent}
     */
    mountAppend() {
        return this._mount('append');
    }

    /**
     * @param {string} position One of 'append' or 'prepend'
     * @returns {TestThrottleSelectorComponent}
     */
    _mount(position) {
        const pos = position || 'append';
        const containerPath = TestThrottleSelectorComponent.containerPath;
        const itemPath = TestThrottleSelectorComponent.itemPath;
        $.get(containerPath, (containerTpl) => {
            const container = $(containerTpl);
            const list = container.find(".list");
            this.$root[pos](container);
            $.get(itemPath, (itemTpl) => {
                this._domButtons = this.options.map((opt, optIndex) => {
                    const btn = $(itemTpl.replace("{{ label }}", `${opt}%`))
                        .on("click", () => { this.selectedIndex = optIndex; });
                    btn.appendTo(list);
                    return btn;
                });

                this.selectedIndex = this._selectedIndex;
            });
        });
        return this;
    }

    /**
     * @param {number} index Index of option to select
     */
    set selectedIndex(index) {
        this._domButtons.forEach((btn, btnIndex) => {
            if (index === btnIndex) {
                btn.removeClass("inactive");
            } else {
                btn.addClass("inactive");
            }
        });
        const isChanged = index !== this._selectedIndex;
        if (isChanged && this._onSelected instanceof Function) {
            this._callOnSelected(index);
        }
        this._selectedIndex = index;
    }

    get selectedIndex() { return this._selectedIndex; }

    /**
     * @param {Function} callback `fn(value)` where `value` is 1000-2000
     * @returns {TestThrottleSelectorComponent}
     */
    onSelection(callback) {
        this._onSelected = callback;
    }

    _callOnSelected(index) {
        const opt = this.options[index];
        const value = 1000 + Math.ceil(1000 * (opt / 100));
        this._onSelected.call(this._onSelected, value);
    }
}
