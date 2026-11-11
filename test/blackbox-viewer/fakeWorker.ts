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

/** Stands in for Worker: records the script URL and posted request, and lets a test answer. */
export class FakeWorker {
    static readonly instances: FakeWorker[] = [];
    url: string;
    posted: unknown[] = [];
    terminated = false;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    onmessageerror: ((event: Event) => void) | null = null;

    constructor(url: URL) {
        this.url = url.pathname;
        FakeWorker.instances.push(this);
    }

    postMessage(message: unknown) {
        this.posted.push(message);
    }

    terminate() {
        this.terminated = true;
    }
}
