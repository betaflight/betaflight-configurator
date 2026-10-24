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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import type { useLogStore } from "../../src/stores/log";

type LogStore = ReturnType<typeof useLogStore>;

interface AppWindow {
    mod: typeof import("../../src/js/log_window");
    store: LogStore;
    pinia: Pinia;
}

interface FakePopup {
    closed: boolean;
    focus: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    logChannel?: string;
    i18next?: unknown;
}

type ErrorHandler = (err: unknown) => void;
type Subscribe = (event: string, handler: ErrorHandler) => void;
const nodeProcess = (globalThis as unknown as { process: { on: Subscribe; off: Subscribe } }).process;

let stops: (() => void)[] = [];
let uncaught: unknown[] = [];
const recordUncaught: ErrorHandler = (err) => uncaught.push(err);

beforeEach(() => {
    stops = [];
    uncaught = [];
    // BroadcastChannel handlers run outside the test's call stack, so their errors only surface here.
    nodeProcess.on("uncaughtException", recordUncaught);
    nodeProcess.on("unhandledRejection", recordUncaught);
});

afterEach(async () => {
    stops.forEach((stop) => stop());
    await settle();
    nodeProcess.off("uncaughtException", recordUncaught);
    nodeProcess.off("unhandledRejection", recordUncaught);
    vi.unstubAllGlobals();
    expect(uncaught).toEqual([]);
});

// Each simulated window gets its own module registry and Pinia, as separate browser windows would.
async function newWindow(): Promise<AppWindow> {
    vi.resetModules();
    const pinia = createPinia();
    setActivePinia(pinia);
    const { useLogStore } = await import("../../src/stores/log");
    const mod = await import("../../src/js/log_window");
    return { mod, store: useLogStore(pinia), pinia };
}

function start(win: AppWindow, run: (mod: AppWindow["mod"]) => () => void): () => void {
    setActivePinia(win.pinia);
    const stop = run(win.mod);
    stops.push(stop);
    return stop;
}

const publish = (win: AppWindow, name?: string) => start(win, (mod) => mod.publishLog(name));
const follow = (win: AppWindow, name: string) => start(win, (mod) => mod.followLog(name));

async function settle(ms = 60): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await new Promise((resolve) => setTimeout(resolve, ms / 6));
    }
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

let channelCounter = 0;
const uniqueName = () => `test-log-${channelCounter++}`;

const messages = (store: LogStore) => store.entries.map((entry) => entry.message);

function addMany(store: LogStore, prefix: string, count: number) {
    for (let i = 0; i < count; i++) {
        store.add(`${prefix}${i}`);
    }
}

async function setUp(followerCount: number, preloaded = 0) {
    const main = await newWindow();
    addMany(main.store, "pre-", preloaded);
    const name = uniqueName();
    const stopPublisher = publish(main, name);
    const followers: AppWindow[] = [];
    const stopFollowers: (() => void)[] = [];
    for (let i = 0; i < followerCount; i++) {
        const win = await newWindow();
        stopFollowers.push(follow(win, name));
        followers.push(win);
    }
    await settle();
    return { main, name, followers, stopPublisher, stopFollowers };
}

function countClears(store: LogStore) {
    const count = { value: 0 };
    store.$onAction(({ name }) => {
        if (name === "clear") {
            count.value++;
        }
    });
    return count;
}

function stubOpen({ blocked = false } = {}) {
    const popups: FakePopup[] = [];
    const open = vi.fn(() => {
        if (blocked) {
            return null;
        }
        const popup: FakePopup = { closed: false, focus: vi.fn(), close: vi.fn(() => (popup.closed = true)) };
        popups.push(popup);
        return popup;
    });
    vi.stubGlobal("open", open);
    return { open, popups };
}

describe("log window mirroring", () => {
    it("delivers a snapshot of everything logged before the follower started", async () => {
        const { main, followers } = await setUp(1, 25);

        expect(followers[0].store.entries).toHaveLength(25);
        expect(followers[0].store.entries).toEqual(main.store.entries);
    });

    it("streams entries logged via add or append with their original id and timestamp", async () => {
        const { main, followers } = await setUp(1);

        main.store.add("connected");
        main.store.append({ id: 4242, timestamp: "custom-ts", message: "appended" });
        await settle();

        expect(followers[0].store.entries).toEqual(main.store.entries);
        expect(followers[0].store.entries[1]).toEqual({ id: 4242, timestamp: "custom-ts", message: "appended" });
    });

    it("has neither duplicates nor gaps for a burst logged between follower start and snapshot arrival", async () => {
        const { main, name } = await setUp(0, 10);
        const popup = await newWindow();

        follow(popup, name);
        addMany(main.store, "burst-", 300);
        await settle();
        addMany(main.store, "after-", 5);
        await settle();

        expect(popup.store.entries).toEqual(main.store.entries);
    });

    it("keeps order under a large single-tick burst", async () => {
        const { main, followers } = await setUp(1);

        addMany(main.store, "b", 800);
        await settle(120);

        expect(messages(followers[0].store)).toEqual(Array.from({ length: 800 }, (_, i) => `b${i}`));
    });

    it("mirrors into several followers, including one started mid-stream", async () => {
        const { main, name, followers } = await setUp(2);
        addMany(main.store, "a", 30);
        await settle();
        const late = await newWindow();
        follow(late, name);
        addMany(main.store, "b", 30);
        await settle();

        for (const win of [...followers, late]) {
            expect(win.store.entries).toEqual(main.store.entries);
        }
    });

    it("keeps both sides at the store's 1000 entry cap", async () => {
        const { main, followers } = await setUp(1, 1200);
        expect(followers[0].store.entries).toEqual(main.store.entries);

        addMany(main.store, "over-", 5);
        await settle();

        expect(main.store.entries).toHaveLength(1000);
        expect(followers[0].store.entries).toEqual(main.store.entries);
        expect(messages(followers[0].store).slice(-5)).toEqual(["over-0", "over-1", "over-2", "over-3", "over-4"]);
    });
});

describe("log window clearing", () => {
    it("propagates an app clear to every follower, ahead of entries logged in the same tick", async () => {
        const { main, followers } = await setUp(2, 5);

        main.store.clear();
        addMany(main.store, "new-", 3);
        await settle();

        expect(main.store.entries.map((entry) => entry.id)).toEqual([1, 2, 3]);
        for (const win of followers) {
            expect(win.store.entries).toEqual(main.store.entries);
        }
    });

    it("clears the app and other followers when one follower clears, without a clear loop", async () => {
        const { main, followers } = await setUp(2, 5);
        const [a, b] = followers;
        const clears = [main.store, a.store, b.store].map(countClears);

        a.store.clear();
        await settle(150);

        expect(clears.map((count) => count.value)).toEqual([1, 1, 0]);
        for (const win of [main, a, b]) {
            expect(win.store.entries).toEqual([]);
        }

        main.store.add("survives");
        await settle();
        for (const win of [main, a, b]) {
            expect(messages(win.store)).toEqual(["survives"]);
        }
    });

    it("converges when a follower clears while the app is mid-burst", async () => {
        const { main, followers } = await setUp(2);

        addMany(main.store, "before-", 50);
        await nextTick();
        followers[0].store.clear();
        addMany(main.store, "racing-", 50);
        await nextTick();
        addMany(main.store, "later-", 50);
        await settle();

        for (const win of followers) {
            expect(win.store.entries).toEqual(main.store.entries);
        }
    });
});

describe("log window channel", () => {
    it.each([
        ["null", null],
        ["a string", "garbage"],
        ["an empty object", {}],
        ["an unknown type", { type: "unknown-type" }],
        ["a number", 42],
    ])("survives %s posted by a third party", async (_label, payload) => {
        const { main, name, followers } = await setUp(1, 2);

        const intruder = new BroadcastChannel(name);
        intruder.postMessage(payload);
        await settle();
        intruder.close();

        main.store.add("still works");
        await settle();
        expect(followers[0].store.entries).toEqual(main.store.entries);
    });

    it("detaches a stopped follower in both directions and leaves the others mirroring", async () => {
        const { main, followers, stopFollowers } = await setUp(2, 3);
        const [a, b] = followers;
        const before = [...a.store.entries];

        stopFollowers[0]();
        main.store.add("after stop");
        await settle();
        expect(a.store.entries).toEqual(before);
        expect(messages(b.store)).toEqual(["pre-0", "pre-1", "pre-2", "after stop"]);

        a.store.clear();
        await settle();
        expect(main.store.entries).toHaveLength(4);
        expect(b.store.entries).toHaveLength(4);
    });

    it("detaches a stopped publisher in both directions", async () => {
        const { main, name, followers, stopPublisher } = await setUp(1, 3);
        const [a] = followers;

        stopPublisher();
        main.store.add("after stop");
        await settle();
        expect(messages(a.store)).toEqual(["pre-0", "pre-1", "pre-2"]);

        a.store.clear();
        await settle();
        expect(main.store.entries).toHaveLength(4);

        const late = await newWindow();
        follow(late, name);
        await settle();
        expect(late.store.entries).toEqual([]);
    });

    it("gives each default-named publisher its own channel", async () => {
        const names: string[] = [];
        const apps: AppWindow[] = [];
        for (const label of ["first", "second"]) {
            const app = await newWindow();
            const { popups } = stubOpen();
            publish(app);
            app.mod.openLogWindow();
            app.store.add(`${label} only`);
            names.push(popups[0].logChannel as string);
            apps.push(app);
        }
        expect(names[0]).toMatch(/^betaflight-log-/);
        expect(names[1]).not.toBe(names[0]);

        const followers = [await newWindow(), await newWindow()];
        followers.forEach((win, i) => follow(win, names[i]));
        await settle();
        expect(followers.map((win) => messages(win.store))).toEqual([["first only"], ["second only"]]);

        followers[0].store.clear();
        await settle();
        expect(messages(apps[1].store)).toEqual(["second only"]);
        expect(messages(followers[1].store)).toEqual(["second only"]);
    });
});

describe("openLogWindow", () => {
    it("does nothing before publishLog has been called or after it has stopped", async () => {
        const main = await newWindow();
        const { open } = stubOpen();

        main.mod.openLogWindow();
        publish(main, uniqueName())();
        main.mod.openLogWindow();

        expect(open).not.toHaveBeenCalled();
    });

    it("opens the page resolved against document.baseURI and hands over the channel and i18next", async () => {
        const main = await newWindow();
        const { open, popups } = stubOpen();
        const name = uniqueName();
        publish(main, name);
        const i18next = (await import("i18next")).default;

        main.mod.openLogWindow();

        expect(open).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith(
            new URL("components/log/log_window.html", document.baseURI).href,
            expect.any(String),
            expect.any(String),
        );
        expect(popups[0].logChannel).toBe(name);
        expect(popups[0].i18next).toBe(i18next);
    });

    it("focuses the open window instead of opening another, and reopens once it is closed", async () => {
        const main = await newWindow();
        const { open, popups } = stubOpen();
        publish(main, uniqueName());

        main.mod.openLogWindow();
        main.mod.openLogWindow();
        expect(open).toHaveBeenCalledOnce();
        expect(popups[0].focus).toHaveBeenCalledOnce();

        popups[0].closed = true;
        main.mod.openLogWindow();
        expect(open).toHaveBeenCalledTimes(2);
        expect(popups[1].logChannel).toBe(popups[0].logChannel);
    });

    it("survives a blocked popup and retries on the next call", async () => {
        const main = await newWindow();
        const { open } = stubOpen({ blocked: true });
        publish(main, uniqueName());

        expect(() => main.mod.openLogWindow()).not.toThrow();
        expect(() => main.mod.openLogWindow()).not.toThrow();
        expect(open).toHaveBeenCalledTimes(2);
    });

    it("closes the pop-out on pagehide, and tolerates no pop-out or an already closed one", async () => {
        const main = await newWindow();
        const { popups } = stubOpen();
        publish(main, uniqueName());
        const pagehide = () => globalThis.dispatchEvent(new Event("pagehide"));

        expect(pagehide).not.toThrow();
        main.mod.openLogWindow();
        pagehide();
        expect(popups[0].close).toHaveBeenCalledOnce();
        expect(pagehide).not.toThrow();
    });
});
