import { i18n } from "../../js/localization";

// Keyed by the claim stem the firmware `peripherals` command prints, which is
// the owning CLI setting minus its _uart part. `tab` names the sidebar tab the
// assignment is made from; claims with no tab of their own are CLI-assigned.
const CLAIM_DEFINITIONS = {
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
 * @param {string} name a claim as `peripherals` prints it, e.g. "gps", "msp_2"
 * @returns {{label: string, tab: string|null}}
 */
export function describeClaim(name) {
    let definition = CLAIM_DEFINITIONS[name];
    let stem = name;
    let instance = null;

    if (!definition) {
        const match = name.match(/^(.*)_(\d+)$/);
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
