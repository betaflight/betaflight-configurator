class EscProtocols {
    static get PROTOCOL_PWM() {
        return "PWM_OUTPUT";
    }
    static get PROTOCOL_ONESHOT125() {
        return "ONESHOT125";
    }
    static get PROTOCOL_ONESHOT42() {
        return "ONESHOT42";
    }
    static get PROTOCOL_MULTISHOT() {
        return "MULTISHOT";
    }
    static get PROTOCOL_BRUSHED() {
        return "BRUSHED";
    }
    static get PROTOCOL_DSHOT150() {
        return "DSHOT150";
    }
    static get PROTOCOL_DSHOT300() {
        return "DSHOT300";
    }
    static get PROTOCOL_DSHOT600() {
        return "DSHOT600";
    }
    static get PROTOCOL_PROSHOT1000() {
        return "PROSHOT1000";
    }
    static get PROTOCOL_DISABLED() {
        return "DISABLED";
    }

    /**
     * Firmware build option each ESC protocol needs. Keys are the protocol
     * names returned by GetAvailableProtocols(), values are keys of
     * FIRMWARE_BUILD_OPTIONS. DISABLED is deliberately absent: it is always
     * selectable, and a protocol without an entry is never gated.
     */
    static get BUILD_OPTIONS() {
        return {
            [EscProtocols.PROTOCOL_PWM]: "USE_PWM_OUTPUT",
            [EscProtocols.PROTOCOL_ONESHOT125]: "USE_ONESHOT",
            [EscProtocols.PROTOCOL_ONESHOT42]: "USE_ONESHOT",
            [EscProtocols.PROTOCOL_MULTISHOT]: "USE_MULTISHOT",
            [EscProtocols.PROTOCOL_BRUSHED]: "USE_BRUSHED",
            [EscProtocols.PROTOCOL_DSHOT150]: "USE_DSHOT",
            [EscProtocols.PROTOCOL_DSHOT300]: "USE_DSHOT",
            [EscProtocols.PROTOCOL_DSHOT600]: "USE_DSHOT",
            [EscProtocols.PROTOCOL_PROSHOT1000]: "USE_PROSHOT",
        };
    }

    static GetBuildOption(protocolName) {
        return EscProtocols.BUILD_OPTIONS[protocolName];
    }

    static get DSHOT_PROTOCOLS_SET() {
        return [
            EscProtocols.PROTOCOL_DSHOT150,
            EscProtocols.PROTOCOL_DSHOT300,
            EscProtocols.PROTOCOL_DSHOT600,
            EscProtocols.PROTOCOL_PROSHOT1000,
        ];
    }

    static GetProtocolName(apiVersion, protocolIndex) {
        const escProtocols = EscProtocols.GetAvailableProtocols(apiVersion);
        return escProtocols[protocolIndex];
    }

    static IsProtocolDshot(apiVersion, protocolIndex) {
        const protocolName = EscProtocols.GetProtocolName(apiVersion, protocolIndex);
        return EscProtocols.DSHOT_PROTOCOLS_SET.includes(protocolName);
    }

    static GetAvailableProtocols(_apiVersion) {
        const escProtocols = [
            EscProtocols.PROTOCOL_PWM,
            EscProtocols.PROTOCOL_ONESHOT125,
            EscProtocols.PROTOCOL_ONESHOT42,
            EscProtocols.PROTOCOL_MULTISHOT,
            EscProtocols.PROTOCOL_BRUSHED,
            EscProtocols.PROTOCOL_DSHOT150,
            EscProtocols.PROTOCOL_DSHOT300,
            EscProtocols.PROTOCOL_DSHOT600,
            EscProtocols.PROTOCOL_PROSHOT1000,
            EscProtocols.PROTOCOL_DISABLED,
        ];

        return escProtocols;
    }

    static ReorderPwmProtocols(_apiVersion, protocolIndex) {
        return protocolIndex;
    }
}

export default EscProtocols;
