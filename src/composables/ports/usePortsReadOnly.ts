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

import { computed, type ComputedRef } from "vue";
import semver from "semver";
import { API_VERSION_1_49 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";

/**
 * From API 1.49 each feature owns its serial port on its own parameter group,
 * and the per-port function mask survives only as a read-only view synthesised
 * from those. MSP_SET_CF_SERIAL_CONFIG and MSP2_COMMON_SET_SERIAL_CONFIG are
 * retired there, so writing through the mask silently does nothing. Ports are
 * assigned from the tab that owns the feature instead.
 *
 * An unreadable version reads as writable, which is how every firmware behaved
 * before the split.
 */
export function serialPortsAreReadOnly(apiVersion: string | null | undefined): boolean {
    const version = semver.valid(apiVersion);
    return version ? semver.gte(version, API_VERSION_1_49) : false;
}

export function usePortsReadOnly(): ComputedRef<boolean> {
    const fcStore = useFlightControllerStore();

    return computed(() => serialPortsAreReadOnly(fcStore.config.apiVersion));
}
