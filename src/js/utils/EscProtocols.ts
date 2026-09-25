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

class EscProtocols {
    static get PROTOCOL_PWM(): string {
        return "PWM_OUTPUT";
    }
    static get PROTOCOL_ONESHOT125(): string {
        return "ONESHOT125";
    }
    static get PROTOCOL_ONESHOT42(): string {
        return "ONESHOT42";
    }
    static get PROTOCOL_MULTISHOT(): string {
        return "MULTISHOT";
    }
    static get PROTOCOL_BRUSHED(): string {
        return "BRUSHED";
    }
    static get PROTOCOL_DSHOT150(): string {
        return "DSHOT150";
    }
    static get PROTOCOL_DSHOT300(): string {
        return "DSHOT300";
    }
    static get PROTOCOL_DSHOT600(): string {
        return "DSHOT600";
    }
    static get PROTOCOL_PROSHOT1000(): string {
        return "PROSHOT1000";
    }
    static get PROTOCOL_DISABLED(): string {
        return "DISABLED";
    }

    /**
     * Firmware build option each ESC protocol needs. Keys are the protocol
     * names returned by GetAvailableProtocols(), values are keys of
     * FIRMWARE_BUILD_OPTIONS. DISABLED is deliberately absent: it is always
     * selectable, and a protocol without an entry is never gated.
     */
    static get BUILD_OPTIONS(): Record<string, string> {
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

    static GetBuildOption(protocolName: string): string | undefined {
        return EscProtocols.BUILD_OPTIONS[protocolName];
    }

    static get DSHOT_PROTOCOLS_SET(): string[] {
        return [
            EscProtocols.PROTOCOL_DSHOT150,
            EscProtocols.PROTOCOL_DSHOT300,
            EscProtocols.PROTOCOL_DSHOT600,
            EscProtocols.PROTOCOL_PROSHOT1000,
        ];
    }

    static GetProtocolName(apiVersion: string, protocolIndex: number): string | undefined {
        const escProtocols = EscProtocols.GetAvailableProtocols(apiVersion);
        return escProtocols[protocolIndex];
    }

    static IsProtocolDshot(apiVersion: string, protocolIndex: number): boolean {
        const protocolName = EscProtocols.GetProtocolName(apiVersion, protocolIndex);
        return protocolName !== undefined && EscProtocols.DSHOT_PROTOCOLS_SET.includes(protocolName);
    }

    static GetAvailableProtocols(_apiVersion: string): string[] {
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

    static ReorderPwmProtocols(_apiVersion: string, protocolIndex: number): number {
        return protocolIndex;
    }
}

export default EscProtocols;
