import { computed } from "vue";
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
 *
 * @param {string} apiVersion
 * @returns {boolean}
 */
export function serialPortsAreReadOnly(apiVersion) {
    return semver.valid(apiVersion) ? semver.gte(apiVersion, API_VERSION_1_49) : false;
}

export function usePortsReadOnly() {
    const fcStore = useFlightControllerStore();

    return computed(() => serialPortsAreReadOnly(fcStore.config.apiVersion));
}
