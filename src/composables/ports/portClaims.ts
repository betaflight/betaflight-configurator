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

import { i18n } from "../../js/localization";

// Keyed by the claim stem the firmware `peripherals` command prints, which is
// the owning CLI setting minus its _uart part. `tab` names the sidebar tab the
// assignment is made from; claims with no tab of their own are CLI-assigned.
interface ClaimDefinition {
    i18nKey: string;
    tab: string | null;
    // also matches `<stem>_<n>`, e.g. "msp_2"
    instanced?: boolean;
}

/** What the Ports tab shows for a claim or inactive reason, and where to change it. */
export interface ClaimDescription {
    label: string;
    tab: string | null;
}

const CLAIM_DEFINITIONS: Record<string, ClaimDefinition | undefined> = {
    msp: { i18nKey: "portsClaimMsp", tab: null, instanced: true },
    gps: { i18nKey: "portsClaimGps", tab: "gps" },
    rx: { i18nKey: "portsClaimRx", tab: "receiver" },
    blackbox: { i18nKey: "portsClaimBlackbox", tab: "onboard_logging" },
    esc_sensor: { i18nKey: "portsClaimEscSensor", tab: "motors" },
    rcdevice: { i18nKey: "portsClaimRcdevice", tab: "receiver" },
    gimbal: { i18nKey: "portsClaimGimbal", tab: null },
    vtx: { i18nKey: "portsClaimVtx", tab: "vtx" },
    rangefinder: { i18nKey: "portsClaimRangefinder", tab: "sensors" },
    opticalflow: { i18nKey: "portsClaimOpticalflow", tab: "sensors" },
    osd: { i18nKey: "portsClaimOsd", tab: "osd" },
    osd_custom_text: { i18nKey: "portsClaimOsdCustomText", tab: "osd" },
    telemetry: { i18nKey: "portsClaimTelemetry", tab: null, instanced: true },
};

/**
 * @param name a claim as `peripherals` prints it, e.g. "gps", "msp_2"
 */
export function describeClaim(name: string): ClaimDescription {
    let definition = CLAIM_DEFINITIONS[name];
    let stem = name;
    let instance: string | null = null;

    if (!definition) {
        const match = /^(.*)_(\d+)$/.exec(name);
        if (match && CLAIM_DEFINITIONS[match[1]]?.instanced) {
            definition = CLAIM_DEFINITIONS[match[1]];
            stem = match[1];
            instance = match[2];
        }
    }

    if (!definition) {
        return { label: name, tab: null };
    }

    const base = i18n.getMessage(definition.i18nKey) || stem;
    return {
        label: instance ? `${base} ${instance}` : base,
        tab: definition.tab,
    };
}

// Keyed by the reason the firmware prints beside a port it cannot open.  An
// unknown reason still reads as inactive, with the firmware's own wording.
const INACTIVE_REASONS: Record<string, ClaimDefinition | undefined> = {
    "feature SOFTSERIAL off": { i18nKey: "portsInactiveSoftSerialFeature", tab: "configuration" },
    "no pins": { i18nKey: "portsInactiveNoPins", tab: null },
};

/**
 * @param reason as `peripherals` prints it, e.g. "feature SOFTSERIAL off"
 */
export function describeInactiveReason(reason: string): ClaimDescription {
    const definition = INACTIVE_REASONS[reason];
    if (!definition) {
        return { label: i18n.getMessage("portsInactiveReason", [reason]) || reason, tab: null };
    }

    return { label: i18n.getMessage(definition.i18nKey), tab: definition.tab };
}
