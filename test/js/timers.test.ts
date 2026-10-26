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
import {
    addInterval,
    addTimeout,
    killAllIntervals,
    killAllTimeouts,
    pauseInterval,
    removeInterval,
    removeTimeout,
    resumeInterval,
} from "../../src/js/timers";

// The registry is module state, so every test starts and ends with it empty.
beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    killAllIntervals();
    killAllTimeouts();
    vi.useRealTimers();
});

describe("intervals", () => {
    it("ticks at the interval and counts each run", () => {
        const code = vi.fn();
        const entry = addInterval("poll", code, 100);

        vi.advanceTimersByTime(350);

        expect(code).toHaveBeenCalledTimes(3);
        expect(entry.fired).toBe(3);
    });

    it("runs once immediately when asked to", () => {
        const code = vi.fn();
        const entry = addInterval("poll", code, 100, true);

        expect(code).toHaveBeenCalledTimes(1);
        expect(entry.fired).toBe(1);
    });

    it("replaces a running interval of the same name instead of stacking a second", () => {
        const first = vi.fn();
        const second = vi.fn();
        addInterval("poll", first, 100);
        addInterval("poll", second, 100);

        vi.advanceTimersByTime(100);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("removes by name, and reports a name it does not know", () => {
        const code = vi.fn();
        addInterval("poll", code, 100);

        expect(removeInterval("poll")).toBe(true);
        expect(removeInterval("poll")).toBe(false);

        vi.advanceTimersByTime(500);
        expect(code).not.toHaveBeenCalled();
    });

    it("pauses and resumes at the same interval", () => {
        const code = vi.fn();
        addInterval("poll", code, 100);

        expect(pauseInterval("poll")).toBe(true);
        vi.advanceTimersByTime(500);
        expect(code).not.toHaveBeenCalled();

        expect(resumeInterval("poll")).toBe(true);
        vi.advanceTimersByTime(200);
        expect(code).toHaveBeenCalledTimes(2);
    });

    it("resumes only a paused interval", () => {
        const code = vi.fn();
        addInterval("poll", code, 100);

        expect(resumeInterval("poll")).toBe(false);
        expect(pauseInterval("missing")).toBe(false);
        expect(resumeInterval("missing")).toBe(false);

        // Still exactly one timer: resuming a running interval did not start a second.
        vi.advanceTimersByTime(100);
        expect(code).toHaveBeenCalledTimes(1);
    });

    it("kills every interval except the ones to keep, and counts what it stopped", () => {
        const kept = vi.fn();
        const killed = vi.fn();
        addInterval("keep", kept, 100);
        addInterval("a", killed, 100);
        addInterval("b", killed, 100);

        expect(killAllIntervals(["keep"])).toBe(2);

        vi.advanceTimersByTime(100);
        expect(kept).toHaveBeenCalledTimes(1);
        expect(killed).not.toHaveBeenCalled();
    });
});

describe("timeouts", () => {
    it("runs once and then leaves the registry", () => {
        const code = vi.fn();
        addTimeout("later", code, 100);

        vi.advanceTimersByTime(100);

        expect(code).toHaveBeenCalledTimes(1);
        expect(removeTimeout("later")).toBe(false);
    });

    it("keeps same-named timeouts side by side; removing by name stops the oldest", () => {
        const first = vi.fn();
        const second = vi.fn();
        addTimeout("later", first, 100);
        addTimeout("later", second, 100);

        expect(removeTimeout("later")).toBe(true);
        vi.advanceTimersByTime(100);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("kills every pending timeout and counts them", () => {
        const code = vi.fn();
        addTimeout("a", code, 100);
        addTimeout("b", code, 100);

        expect(killAllTimeouts()).toBe(2);
        expect(killAllTimeouts()).toBe(0);

        vi.advanceTimersByTime(100);
        expect(code).not.toHaveBeenCalled();
    });
});
