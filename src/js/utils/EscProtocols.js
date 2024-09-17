class EscProtocols
{
    static get PROTOCOL_PWM()          { return "PWM"; }
    static get PROTOCOL_ONESHOT125()   { return "ONESHOT125"; }
    static get PROTOCOL_ONESHOT42()    { return "ONESHOT42"; }
    static get PROTOCOL_MULTISHOT()    { return "MULTISHOT"; }
    static get PROTOCOL_BRUSHED()      { return "BRUSHED"; }
    static get PROTOCOL_DSHOT150()     { return "DSHOT150"; }
    static get PROTOCOL_DSHOT300()     { return "DSHOT300"; }
    static get PROTOCOL_DSHOT600()     { return "DSHOT600"; }
    static get PROTOCOL_PROSHOT1000()  { return "PROSHOT1000"; }
    static get PROTOCOL_DISABLED()     { return "DISABLED"; }

    static get DSHOT_PROTOCOLS_SET()
    {
        return [
            EscProtocols.PROTOCOL_DSHOT150,
            EscProtocols.PROTOCOL_DSHOT300,
            EscProtocols.PROTOCOL_DSHOT600,
            EscProtocols.PROTOCOL_PROSHOT1000,
        ];
    }

    static GetProtocolName(apiVersion, protocolIndex)
    {
        const escProtocols = EscProtocols.GetAvailableProtocols(apiVersion);
        return escProtocols[protocolIndex];
    }

    static IsProtocolDshot(apiVersion, protocolIndex)
    {
        const protocolName = EscProtocols.GetProtocolName(apiVersion, protocolIndex);
        return EscProtocols.DSHOT_PROTOCOLS_SET.includes(protocolName);
    }

    static GetAvailableProtocols(_apiVersion)
    {
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

    static ReorderPwmProtocols(apiVersion, protocolIndex)
    {
        return protocolIndex;
    }
}

export default EscProtocols;
