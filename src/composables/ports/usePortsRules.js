import FC from "../../js/fc";
import { i18n } from "../../js/localization";
import semver from "semver";
import { API_VERSION_1_45, API_VERSION_1_47 } from "../../js/data_storage";

export function usePortsRules() {
    const functionRules = [
        { name: "MSP", groups: ["configuration", "msp"], maxPorts: 2 },
        { name: "GPS", groups: ["sensors"], maxPorts: 1, dependsOn: "USE_GPS" },
        {
            name: "TELEMETRY_FRSKY",
            groups: ["telemetry"],
            sharableWith: ["msp"],
            notSharableWith: ["peripherals"],
            maxPorts: 1,
            dependsOn: "USE_TELEMETRY_FRSKY_HUB",
        },
        {
            name: "TELEMETRY_HOTT",
            groups: ["telemetry"],
            sharableWith: ["msp"],
            notSharableWith: ["peripherals"],
            maxPorts: 1,
            dependsOn: "USE_TELEMETRY_HOTT",
        },
        { name: "TELEMETRY_SMARTPORT", groups: ["telemetry"], maxPorts: 1, dependsOn: "USE_TELEMETRY_SMARTPORT" },
        { name: "RX_SERIAL", groups: ["rx"], maxPorts: 1 },
        {
            name: "BLACKBOX",
            groups: ["peripherals"],
            sharableWith: ["msp"],
            notSharableWith: ["telemetry"],
            maxPorts: 1,
        },
        {
            name: "TELEMETRY_LTM",
            groups: ["telemetry"],
            sharableWith: ["msp"],
            notSharableWith: ["peripherals"],
            maxPorts: 1,
            dependsOn: "USE_TELEMETRY_LTM",
        },
        {
            name: "TELEMETRY_MAVLINK",
            groups: ["telemetry"],
            sharableWith: ["msp"],
            notSharableWith: ["peripherals"],
            maxPorts: 1,
            dependsOn: "USE_TELEMETRY_MAVLINK",
        },
        { name: "IRC_TRAMP", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_VTX" },
        { name: "ESC_SENSOR", groups: ["sensors"], maxPorts: 1 },
        { name: "TBS_SMARTAUDIO", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_VTX" },
        { name: "TELEMETRY_IBUS", groups: ["telemetry"], maxPorts: 1, dependsOn: "USE_TELEMETRY_IBUS_EXTENDED" },
        { name: "RUNCAM_DEVICE_CONTROL", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_CAMERA_CONTROL" },
        { name: "LIDAR_TF", groups: ["peripherals"], maxPorts: 1 },
        { name: "FRSKY_OSD", groups: ["peripherals"], maxPorts: 1, dependsOn: "USE_FRSKYOSD" },
    ];

    if (FC.CONFIG && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_45)) {
        functionRules.push({ name: "VTX_MSP", groups: ["peripherals"], sharableWith: ["msp"], maxPorts: 1 });
    }

    for (const rule of functionRules) {
        rule.displayName = i18n.getMessage(`portsFunction_${rule.name}`);
    }

    const mspBaudRates = ["9600", "19200", "38400", "57600", "115200", "230400", "250000", "500000", "1000000"];
    const gpsBaudRates = ["AUTO", "9600", "19200", "38400", "57600", "115200"];
    const telemetryBaudRates = ["AUTO", "9600", "19200", "38400", "57600", "115200"];
    const blackboxBaudRates = [
        "AUTO",
        "19200",
        "38400",
        "57600",
        "115200",
        "230400",
        "250000",
        "1500000",
        "2000000",
        "2470000",
    ];

    if (FC.CONFIG && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_47)) {
        gpsBaudRates.push("230400");
        telemetryBaudRates.push("230400", "460800");
    }

    const getRules = (group) => {
        const rules = functionRules.filter((r) => r.groups.includes(group));
        return rules.sort((a, b) => a.displayName.localeCompare(b.displayName));
    };

    const isRuleDisabled = (rule) => {
        return (
            FC.CONFIG.buildOptions.length &&
            rule.dependsOn !== undefined &&
            !FC.CONFIG.buildOptions.includes(rule.dependsOn)
        );
    };

    return {
        functionRules,
        mspBaudRates,
        gpsBaudRates,
        telemetryBaudRates,
        blackboxBaudRates,
        getRules,
        isRuleDisabled,
    };
}
