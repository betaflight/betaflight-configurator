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

import { beforeEach, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useConnectionStore } from "../../src/stores/connection";
import { useMixerSaveStore } from "../../src/stores/mixerSave";

beforeEach(() => setActivePinia(createPinia()));

it("does not carry an unconfirmed mixer write onto another connection", () => {
    const connection = useConnectionStore();
    connection.connectedTo = "first FC";
    const mixer = useMixerSaveStore();
    mixer.mixerNeedsSave = true;
    connection.connectedTo = false;
    connection.connectedTo = "second FC";
    expect(mixer.mixerNeedsSave).toBe(false);
});
