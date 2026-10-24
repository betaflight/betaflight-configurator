/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { toRaw } from "vue";
import i18next from "i18next";
import { useLogStore, type LogEntry } from "@/stores/log";

type LogMessage =
    { type: "sync" } | { type: "snapshot"; entries: LogEntry[] } | { type: "add"; entry: LogEntry } | { type: "clear" };

export interface LogWindowHost {
    logChannel?: string;
    i18next?: typeof i18next;
}

const WINDOW_FEATURES = "location=no,width=720,height=420";

let channelName: string | null = null;
let logWindow: Window | null = null;

/**
 * Serves the log store over a BroadcastChannel unique to this app instance, so a pop-out window
 * mirrors it and a second app instance (another browser tab) never feeds it.
 */
export function publishLog(name = `betaflight-log-${crypto.randomUUID()}`): () => void {
    const store = useLogStore();
    const channel = new BroadcastChannel(name);
    const post = (message: LogMessage) => channel.postMessage(message);

    channel.onmessage = ({ data }: MessageEvent<LogMessage | null>) => {
        if (data?.type === "sync") {
            post({ type: "snapshot", entries: toRaw(store.entries) });
        } else if (data?.type === "clear") {
            store.clear();
        }
    };

    const stopActions = store.$onAction(({ name: action, after }) => {
        after(() => {
            if (action === "add" || action === "append") {
                post({ type: "add", entry: toRaw(store.entries[store.entries.length - 1]) });
            } else if (action === "clear") {
                post({ type: "clear" });
            }
        });
    });

    channelName = name;
    return () => {
        stopActions();
        channel.close();
        channelName = null;
    };
}

/** Mirrors the log published on `name` into this window's log store. */
export function followLog(name: string): () => void {
    const store = useLogStore();
    const channel = new BroadcastChannel(name);

    channel.onmessage = ({ data }: MessageEvent<LogMessage | null>) => {
        if (data?.type === "snapshot") {
            store.entries = data.entries;
        } else if (data?.type === "add") {
            store.append(data.entry);
        } else if (data?.type === "clear") {
            store.entries = [];
        }
    };

    const stopActions = store.$onAction(({ name: action }) => {
        if (action === "clear") {
            channel.postMessage({ type: "clear" } satisfies LogMessage);
        }
    });

    channel.postMessage({ type: "sync" } satisfies LogMessage);
    return () => {
        stopActions();
        channel.close();
    };
}

export function openLogWindow(): void {
    if (logWindow && !logWindow.closed) {
        logWindow.focus();
        return;
    }
    if (!channelName) {
        return;
    }

    // Relative to the document base: the app may be served from a sub-path or a custom scheme.
    const url = new URL("components/log/log_window.html", document.baseURI).href;
    const created: (Window & LogWindowHost) | null = globalThis.open(url, "betaflight_log", WINDOW_FEATURES);
    if (!created) {
        return;
    }
    created.logChannel = channelName;
    created.i18next = i18next;
    logWindow = created;
}

globalThis.addEventListener("pagehide", () => logWindow?.close());
