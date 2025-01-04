import { isWeb } from "../utils/isWeb";
/*
  This utility is intended to communicate between chrome windows.
  One window could watch passed values from another window and react to them.
*/

const windowWatcherUtil = {};

windowWatcherUtil.invokeWatcher = function (bindingKey, bindingVal, watchersObject) {
    if (watchersObject[bindingKey]) {
        watchersObject[bindingKey](bindingVal);
    }
};

windowWatcherUtil.iterateOverBindings = function (bindings, watchersObject) {
    let entries = Object.entries(bindings);
    for (const [key, val] of entries) {
        this.invokeWatcher(key, val, watchersObject);
    }
};

windowWatcherUtil.bindWatchers = function (windowObject, watchersObject) {
    if (!windowObject.bindings) {
        windowObject.bindings = {};
    } else {
        this.iterateOverBindings(windowObject.bindings, watchersObject);
    }

    windowObject.bindings = new Proxy(windowObject.bindings, {
        set(target, prop, val, receiver) {
            windowWatcherUtil.invokeWatcher(prop, val, watchersObject);
            return Reflect.set(target, prop, val, receiver);
        },
    });
};

// 'Windows' here could be array or single window reference
windowWatcherUtil.passValue = function (windows, key, val) {
    let applyBinding = function (win, key, val) {
        if (!win) {
            return;
        }

        const contentWindow = isWeb() ? win : win.contentWindow;

        if (contentWindow.bindings) {
            contentWindow.bindings[key] = val;
        } else {
            contentWindow.bindings = {
                [key]: val,
            };
        }
    };

    if (Array.isArray(windows)) {
        windows.forEach((el) => applyBinding(el, key, val));
    } else {
        applyBinding(windows, key, val);
    }
};

export default windowWatcherUtil;
