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

import WebSerial from "./protocols/WebSerial";
import WebBluetooth from "./protocols/WebBluetooth";
import Websocket from "./protocols/WebSocket";
import VirtualSerial, { type VirtualDevice } from "./protocols/VirtualSerial";
import { isAndroid, isTauri, isTauriMacOS } from "./utils/checkCompatibility";
import CapacitorSerial from "./protocols/CapacitorSerial";
import CapacitorBle from "./protocols/CapacitorBle";
import CapacitorTcp from "./protocols/CapacitorTcp";
import TauriSerial from "./protocols/TauriSerial";
import TauriTcp from "./protocols/TauriTcp";
import TauriBle from "./protocols/TauriBle";

// A host name, an IPv4 address, or an IPv6 address in brackets, with an optional port.
// The pattern permits the underscore. mDNS host names can contain an underscore, for example
// elrs_rx.local. An IPv6 address must have brackets, as in a URL, for example [fe80::1]:5761.
const HOST = String.raw`(?:\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::\d+)?`;
/**
 * Makes a regular expression for "<scheme>://host[:port][/path]".
 * @param scheme - one scheme, or an alternation of schemes, for example "wss?".
 * @returns the case-insensitive pattern for that scheme.
 */
const urlPattern = (scheme: string): RegExp => new RegExp(`^(?:${scheme})://${HOST}(?:/.*)?$`, "i");
const WEBSOCKET_URL = urlPattern("wss?");
const TCP_URL = urlPattern("tcp");

/** The slot names a platform registers its transports under. */
export type SerialProtocolName = "serial" | "bluetooth" | "tcp" | "websocket" | "virtual";

/**
 * What a caller connects to: a port path, a URL, "manual" or "virtual". A function also
 * selects the virtual transport.
 */
export type SerialPath = string | (() => unknown);

/**
 * Options handed through to the transport's `connect`. Only the serial transports read
 * them; the flasher asks for even parity and one stop bit for the STM32 bootloader.
 */
export interface SerialConnectOptions {
    baudRate?: number;
    parityBit?: string;
    stopBits?: number | string;
}

/** The payloads callers send. Every transport accepts both. */
export type SerialPayload = ArrayBuffer | Uint8Array<ArrayBuffer>;

/** What `send` reports, as its result and to the callback. 0 bytes means nothing was sent. */
export interface SerialSendResult {
    bytesSent: number;
}

/** A device as a transport lists it. Bluetooth ids are strings ("unknown" for the vendor). */
export interface SerialDevice {
    path: string;
    displayName: string;
    vendorId?: number | string;
    productId?: number | string;
}

/** The virtual transport lists a bare path, with no display name. */
type ListedDevice = SerialDevice | VirtualDevice;

/**
 * The part of a transport this facade calls. The transports differ in the rest: some have
 * no `send` (virtual), no permission prompt (TCP, WebSocket), or no `connectionId` (TCP,
 * WebSocket), and those members are optional here.
 */
export interface SerialProtocol extends EventTarget {
    /** Unset on Android when the native plugin is missing: the constructor returns early. */
    connected?: boolean;
    connectionId?: string | false | null;
    /** Traffic counters, read by port_usage. */
    bitrate?: number;
    bytesSent?: number;
    bytesReceived?: number;
    connect(path: SerialPath, options?: SerialConnectOptions): Promise<boolean | void> | boolean;
    disconnect(): Promise<boolean | void> | boolean;
    send?(data: SerialPayload): Promise<SerialSendResult>;
    /** The facade reads a missing list as empty. */
    getDevices?(): Promise<ListedDevice[] | undefined>;
    requestPermissionDevice?(showAllDevices?: boolean): Promise<SerialDevice | null | undefined>;
    forceClose?(): void;
    getConnectedDevice(): unknown;
    /**
     * Bluetooth only: whether an MSP frame is accepted despite a checksum mismatch (see msp.ts).
     * `expectedChecksum` is the byte received on the wire, `computedChecksum` the one MSP calculated.
     */
    shouldBypassCrc?(expectedChecksum: number, computedChecksum: number): boolean;
}

interface ProtocolSlot {
    name: SerialProtocolName;
    instance: SerialProtocol;
}

/**
 * Base Serial class that manages all protocol implementations
 * and handles event forwarding.
 */
class Serial extends EventTarget {
    /**
     * The transport of the current connection. Read directly by msp.ts and port_usage.
     * Null until the first connect, undefined after a connect to a slot this platform lacks.
     */
    _protocol: SerialProtocol | null | undefined;
    _eventHandlers: Record<string, unknown>;
    logHead: string;
    _hasRawTcp: boolean;
    _protocols: ProtocolSlot[];

    constructor() {
        super();
        this._protocol = null;
        this._eventHandlers = {};

        this.logHead = "[SERIAL]";

        // Initialize protocols with metadata for easier lookup

        // Whether the "tcp" slot speaks raw TCP. In a browser it is a WebSocket, which
        // understands ws:// and wss:// only.
        this._hasRawTcp = isAndroid() || isTauri();

        if (isAndroid()) {
            this._protocols = [
                { name: "serial", instance: new CapacitorSerial() },
                { name: "bluetooth", instance: new CapacitorBle() },
                { name: "tcp", instance: new CapacitorTcp() },
            ];
        } else if (isTauri()) {
            // Tauri shell: raw TCP via the Rust tcp_* commands (so the Betaflight bridge
            // on 5761 works), and WebSocket (ws://, wss://) via the WebSocket API the webview
            // exposes — these are distinct transports, so they get distinct slots. Native
            // serial via tauri-plugin-serialplugin.
            this._protocols = [
                { name: "serial", instance: new TauriSerial() },
                // WKWebView (macOS) doesn't expose Web Bluetooth, so macOS uses the native
                // transport; Linux and Windows keep the webview's own Web Bluetooth.
                {
                    name: "bluetooth",
                    instance: isTauriMacOS() ? new TauriBle() : new WebBluetooth(),
                },
                { name: "tcp", instance: new TauriTcp() },
                { name: "websocket", instance: new Websocket() },
            ];
        } else {
            this._protocols = [
                { name: "serial", instance: new WebSerial() },
                { name: "bluetooth", instance: new WebBluetooth() },
                { name: "tcp", instance: new Websocket() },
            ];
        }

        // Always add virtual protocol
        this._protocols.push({ name: "virtual", instance: new VirtualSerial() });

        // Forward events from all protocols to the Serial class
        this._setupEventForwarding();
    }

    /**
     * Set up event forwarding from all protocols to the Serial class
     */
    _setupEventForwarding(): void {
        // Device-enumeration events come from EVERY transport — device_handler builds
        // the combined device list from all of them.
        const deviceEvents = ["addedDevice", "removedDevice"];
        // Connection-lifecycle events must come ONLY from the active transport. A
        // transport we are no longer connected through can still emit a late event
        // (e.g. a BLE link's gattserverdisconnected firing after the user switched
        // to a serial FC); forwarding it would run onClosed/read_serial against the
        // wrong connection and corrupt the live one.
        const lifecycleEvents = new Set(["connect", "disconnect", "receive"]);

        for (const { name, instance } of this._protocols) {
            if (typeof instance?.addEventListener !== "function") {
                continue;
            }

            for (const eventType of [...deviceEvents, ...lifecycleEvents]) {
                instance.addEventListener(eventType, (event: Event) => {
                    // Drop lifecycle events arriving from a non-active transport.
                    if (lifecycleEvents.has(eventType) && instance !== this._protocol) {
                        return;
                    }

                    this.dispatchEvent(
                        new CustomEvent(event.type, {
                            detail: this._tagDetail(event, name),
                            bubbles: event.bubbles,
                            cancelable: event.cancelable,
                        }),
                    );
                });
            }
        }
    }

    /**
     * Tag a forwarded event's detail with its originating protocol.
     * @param event - the source protocol event
     * @param protocolType - the originating protocol name
     * @returns `receive` re-wrapped, an object detail tagged with its slot, a primitive as-is.
     */
    _tagDetail(event: Event, protocolType: SerialProtocolName): unknown {
        const { detail } = event as CustomEvent<unknown>;
        // 'receive' carries a raw data chunk; re-wrap as { data, protocolType }.
        if (event.type === "receive") {
            return { data: detail, protocolType };
        }
        // A PRIMITIVE detail (notably connect/disconnect dispatching `false` on a
        // failed open) is forwarded as-is — spreading `false` would turn it into a
        // truthy { protocolType }, so onOpen() would treat a failed open as success.
        if (detail !== null && typeof detail === "object") {
            return { ...detail, protocolType };
        }
        return detail;
    }

    /**
     * Finds a registered protocol instance by slot name.
     * @param name - the slot name ("serial", "tcp", "websocket", ...).
     * @returns The instance, or undefined when the platform does not register that slot.
     */
    _instance(name: string | undefined): SerialProtocol | undefined {
        return this._protocols.find((p) => p.name === name)?.instance;
    }

    /**
     * Selects the appropriate protocol based on port path
     * @param portPath - Port path or callback function for virtual mode
     * @returns The matching protocol instance, or undefined when none applies.
     */
    selectProtocol(portPath: SerialPath | null | undefined): SerialProtocol | undefined {
        // Determine which protocol to use based on port path
        const isFn = typeof portPath === "function";
        const s = typeof portPath === "string" ? portPath : "";
        // Default to serial for typical serial device identifiers.
        if (isFn || s === "virtual") {
            return this._instance("virtual");
        }
        // WebSocket endpoints (ws://, wss://) use the HTTP upgrade handshake. Thus they need the
        // WebSocket protocol, and not raw TCP. Tauri has two different slots: "websocket" and the
        // Rust "tcp" slot. If a platform registers only one slot, use "tcp". The web shell uses
        // WebSocket for its "tcp" slot.
        if (WEBSOCKET_URL.test(s)) {
            return this._instance("websocket") ?? this._instance("tcp");
        }
        if (s === "manual" || TCP_URL.test(s)) {
            return this._instance("tcp");
        }
        if (s.startsWith("bluetooth")) {
            return this._instance("bluetooth");
        }
        return this._instance("serial");
    }

    /**
     * Whether a manual target can be opened here, judged by its scheme. A browser has no raw
     * sockets, so a tcp:// address (SITL, the Betaflight bridge) is unreachable from one
     * however it is routed, and offering it only produces a connection that always fails.
     * @param target - a manual target (URL or bare host[:port])
     * @returns true when a transport on this platform understands it
     */
    canOpen(target: string): boolean {
        return !TCP_URL.test(typeof target === "string" ? target.trim() : "") || this._hasRawTcp;
    }

    /**
     * Connect to the specified port with options
     * @param path - Port path or callback for virtual mode
     * @param options - Connection options (baudRate, etc.)
     * @param callback - Called with the result too. The WebSocket transport resolves with no value.
     */
    async connect(
        path: SerialPath,
        options?: SerialConnectOptions,
        callback?: (result: boolean | void) => void,
    ): Promise<boolean | void> {
        // Select the appropriate protocol based directly on the port path
        let result: boolean | void = false;
        try {
            this._protocol = this.selectProtocol(path);
            // A path with no slot on this platform throws here, and is logged below.
            result = await this._protocol!.connect(path, options);
        } catch (error) {
            console.error(
                `${this.logHead} Error during connection to path '${path}' with protocol '${this._protocol?.constructor?.name || "undefined"}':`,
                error,
            );
        }
        callback?.(result);
        return result;
    }

    /**
     * Disconnect from the current connection
     * @param callback - Optional callback for backward compatibility
     * @returns Promise resolving to true if disconnection was successful
     */
    async disconnect(callback?: (result: boolean | void) => void): Promise<boolean | void> {
        let result: boolean | void = false;
        try {
            result = (await this._protocol?.disconnect()) ?? false;
        } catch (error) {
            console.error(`${this.logHead} Error during disconnect:`, error);
        }
        callback?.(result);
        return result;
    }

    /**
     * Send data through the serial connection.
     *
     * The callback is invoked here and only here. Protocols must not be handed
     * it, or every transport that fires it internally would deliver it twice.
     */
    async send(data: SerialPayload, callback?: (result: SerialSendResult) => void): Promise<SerialSendResult> {
        let result: SerialSendResult;
        try {
            // Guard the method too: virtual mode has no send(), and that is a
            // normal path, not an error to log.
            result = (await this._protocol?.send?.(data)) ?? { bytesSent: 0 };
        } catch (error) {
            result = { bytesSent: 0 };
            console.error(`${this.logHead} Error sending data:`, error);
        }
        callback?.(result);
        return result;
    }

    /**
     * Get devices from a specific protocol type or current protocol
     * @param protocolType - Optional protocol type ('serial', 'bluetooth', 'tcp', 'virtual')
     * @returns List of devices. Only the virtual slot lists bare paths, with no display name.
     */
    getDevices(protocolType: "virtual"): Promise<VirtualDevice[]>;
    getDevices(protocolType?: Exclude<SerialProtocolName, "virtual"> | null): Promise<SerialDevice[]>;
    async getDevices(protocolType: string | null = null): Promise<ListedDevice[]> {
        try {
            // Get the appropriate protocol
            const targetProtocol = this._instance(protocolType?.toLowerCase());

            if (!targetProtocol) {
                console.warn(`${this.logHead} No valid protocol for getting devices`);
                return [];
            }

            if (typeof targetProtocol.getDevices !== "function") {
                console.error(`${this.logHead} Selected protocol does not implement getDevices`);
                return [];
            }

            const devices = await targetProtocol.getDevices?.();
            return devices ?? [];
        } catch (error) {
            console.error(`${this.logHead} Error getting devices:`, error);
            return [];
        }
    }

    /**
     * Request permission to access a device
     * @param showAllDevices - Whether to show all devices or only those with filters
     * @param protocolType - Optional protocol type ('serial', 'bluetooth', etc.)
     * @returns The selected device, or false/null/undefined when none was granted
     */
    async requestPermissionDevice(
        showAllDevices = false,
        protocolType?: string,
    ): Promise<SerialDevice | false | null | undefined> {
        let result: SerialDevice | false | null | undefined = false;
        try {
            const targetProtocol = this._instance(protocolType?.toLowerCase());
            // TCP and WebSocket have no prompt; asking one throws, and is logged below.
            result = await targetProtocol?.requestPermissionDevice!(showAllDevices);
        } catch (error) {
            console.error(`${this.logHead} Error requesting device permission:`, error);
        }
        return result;
    }

    forceClose(): void {
        try {
            this._protocol?.forceClose?.();
        } catch (error) {
            console.error(`${this.logHead} Error during force close:`, error);
        }
    }

    /**
     * Get the currently connected device
     */
    getConnectedDevice(): unknown {
        return this._protocol?.getConnectedDevice() || null;
    }

    /**
     * Get connection status
     */
    get connected(): boolean {
        return this._protocol?.connected || false;
    }

    /**
     * Get connectionId
     */
    get connectionId(): string | null {
        return this._protocol?.connectionId || null;
    }

    /**
     * Get protocol
     */
    get protocol(): string | null {
        return this._protocol ? this._protocol.constructor.name.toLowerCase() : null;
    }
}

// Export a singleton instance
export const serial = new Serial();
