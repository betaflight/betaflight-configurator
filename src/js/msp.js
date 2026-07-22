import GUI from "./gui.js";
import CONFIGURATOR from "./data_storage.js";
import { serial } from "./serial.js";
import { MspCancelledError, MspTimeoutError } from "./msp/mspErrors.js";

const MSP = {
    symbols: {
        BEGIN: "$".charCodeAt(0),
        PROTO_V1: "M".charCodeAt(0),
        PROTO_V2: "X".charCodeAt(0),
        FROM_MWC: ">".charCodeAt(0),
        TO_MWC: "<".charCodeAt(0),
        UNSUPPORTED: "!".charCodeAt(0),
        START_OF_TEXT: 0x02,
        END_OF_TEXT: 0x03,
        END_OF_TRANSMISSION: 0x04,
        LINE_FEED: 0x0a,
        CARRIAGE_RETURN: 0x0d,
    },
    constants: {
        PROTOCOL_V1: 1,
        PROTOCOL_V2: 2,
        JUMBO_FRAME_MIN_SIZE: 255,
    },
    decoder_states: {
        IDLE: 0,
        PROTO_IDENTIFIER: 1,
        DIRECTION_V1: 2,
        DIRECTION_V2: 3,
        FLAG_V2: 4,
        PAYLOAD_LENGTH_V1: 5,
        PAYLOAD_LENGTH_JUMBO_LOW: 6,
        PAYLOAD_LENGTH_JUMBO_HIGH: 7,
        PAYLOAD_LENGTH_V2_LOW: 8,
        PAYLOAD_LENGTH_V2_HIGH: 9,
        CODE_V1: 10,
        CODE_JUMBO_V1: 11,
        CODE_V2_LOW: 12,
        CODE_V2_HIGH: 13,
        PAYLOAD_V1: 14,
        PAYLOAD_V2: 15,
        CHECKSUM_V1: 16,
        CHECKSUM_V2: 17,
        CLI_COMMAND: 18,
    },
    state: 0,
    message_direction: 1,
    code: 0,
    dataView: 0,
    message_length_expected: 0,
    message_length_received: 0,
    message_buffer: null,
    message_buffer_uint8_view: null,
    message_checksum: 0,
    crcError: false,

    callbacks: [],
    parked: new Map(), // errorAware requests parked behind an in-flight same-code request
    onTimeout: null, // invoked with the code when an errorAware request exhausts MAX_RETRIES
    packet_error: 0,
    unsupported: 0,

    TIMEOUT: 1000,
    MAX_RETRIES: 3,

    last_received_timestamp: null,
    listeners: [],

    cli_buffer: [], // buffer for CLI character output
    cli_output: [],
    cli_callback: null,
    cli_queue: [], // pending { command, callback, timeoutMs } entries
    cli_in_flight: null,
    cli_timer: null,
    // When a CLI command times out, we don't know whether the firmware is
    // mid-response, about to respond, or silent. Enter a "draining" state
    // where every byte is dropped; the decoder clears the state on the
    // closing ETX (so any bookended late response is consumed in full)
    // or when the drain grace timer expires (a real hang).
    cli_discarding: false,
    cli_drain_timer: null,
    cli_drain_grace_ms: 1000,

    read(readInfo) {
        if (CONFIGURATOR.virtualMode) {
            return;
        }

        const data = new Uint8Array(readInfo.data ?? readInfo);

        for (const chunk of data) {
            if (this.cli_discarding) {
                if (chunk === this.symbols.END_OF_TEXT) {
                    this._end_cli_drain();
                }
                continue;
            }

            switch (this.state) {
                case this.decoder_states.CLI_COMMAND:
                    switch (chunk) {
                        case this.symbols.END_OF_TEXT:
                            this.cli_output.push(this.cli_buffer.join(""));
                            this.cli_buffer.length = 0;
                            this.state = this.decoder_states.IDLE;
                            if (this.cli_callback) {
                                const response = this.cli_output;
                                this.cli_callback(response);
                            }
                            break;
                        case this.symbols.LINE_FEED:
                            this.cli_output.push(this.cli_buffer.join(""));
                            this.cli_buffer.length = 0;
                            break;
                        case this.symbols.CARRIAGE_RETURN:
                            // ignore CRs
                            break;
                        default:
                            this.cli_buffer.push(String.fromCharCode(chunk));
                            break;
                    }
                    break;
                case this.decoder_states.IDLE: // sync char 1
                    switch (chunk) {
                        case this.symbols.BEGIN:
                            this.state = this.decoder_states.PROTO_IDENTIFIER;
                            break;
                        case this.symbols.START_OF_TEXT:
                            this.state = this.decoder_states.CLI_COMMAND;
                            break;
                    }
                    break;
                case this.decoder_states.PROTO_IDENTIFIER: // sync char 2
                    switch (chunk) {
                        case this.symbols.PROTO_V1:
                            this.state = this.decoder_states.DIRECTION_V1;
                            break;
                        case this.symbols.PROTO_V2:
                            this.state = this.decoder_states.DIRECTION_V2;
                            break;
                        default:
                            console.log(`Unknown protocol char ${String.fromCharCode(chunk)}`);
                            this.state = this.decoder_states.IDLE;
                    }
                    break;
                case this.decoder_states.DIRECTION_V1: // direction (should be >)
                case this.decoder_states.DIRECTION_V2:
                    this.unsupported = 0;
                    switch (chunk) {
                        case this.symbols.FROM_MWC:
                            this.message_direction = 1;
                            break;
                        case this.symbols.TO_MWC:
                            this.message_direction = 0;
                            break;
                        case this.symbols.UNSUPPORTED:
                            this.unsupported = 1;
                            break;
                    }
                    this.state =
                        this.state === this.decoder_states.DIRECTION_V1
                            ? this.decoder_states.PAYLOAD_LENGTH_V1
                            : this.decoder_states.FLAG_V2;
                    break;
                case this.decoder_states.FLAG_V2:
                    // Ignored for now
                    this.state = this.decoder_states.CODE_V2_LOW;
                    break;
                case this.decoder_states.PAYLOAD_LENGTH_V1:
                    this.message_length_expected = chunk;

                    if (this.message_length_expected === this.constants.JUMBO_FRAME_MIN_SIZE) {
                        this.state = this.decoder_states.CODE_JUMBO_V1;
                    } else {
                        this._initialize_read_buffer();
                        this.state = this.decoder_states.CODE_V1;
                    }

                    break;
                case this.decoder_states.PAYLOAD_LENGTH_V2_LOW:
                    this.message_length_expected = chunk;
                    this.state = this.decoder_states.PAYLOAD_LENGTH_V2_HIGH;
                    break;
                case this.decoder_states.PAYLOAD_LENGTH_V2_HIGH:
                    this.message_length_expected |= chunk << 8;
                    this._initialize_read_buffer();
                    this.state =
                        this.message_length_expected > 0
                            ? this.decoder_states.PAYLOAD_V2
                            : this.decoder_states.CHECKSUM_V2;
                    break;
                case this.decoder_states.CODE_V1:
                case this.decoder_states.CODE_JUMBO_V1:
                    this.code = chunk;
                    if (this.message_length_expected > 0) {
                        // process payload
                        if (this.state === this.decoder_states.CODE_JUMBO_V1) {
                            this.state = this.decoder_states.PAYLOAD_LENGTH_JUMBO_LOW;
                        } else {
                            this.state = this.decoder_states.PAYLOAD_V1;
                        }
                    } else {
                        // no payload
                        this.state = this.decoder_states.CHECKSUM_V1;
                    }
                    break;
                case this.decoder_states.CODE_V2_LOW:
                    this.code = chunk;
                    this.state = this.decoder_states.CODE_V2_HIGH;
                    break;
                case this.decoder_states.CODE_V2_HIGH:
                    this.code |= chunk << 8;
                    this.state = this.decoder_states.PAYLOAD_LENGTH_V2_LOW;
                    break;
                case this.decoder_states.PAYLOAD_LENGTH_JUMBO_LOW:
                    this.message_length_expected = chunk;
                    this.state = this.decoder_states.PAYLOAD_LENGTH_JUMBO_HIGH;
                    break;
                case this.decoder_states.PAYLOAD_LENGTH_JUMBO_HIGH:
                    this.message_length_expected |= chunk << 8;
                    this._initialize_read_buffer();
                    this.state = this.decoder_states.PAYLOAD_V1;
                    break;
                case this.decoder_states.PAYLOAD_V1:
                case this.decoder_states.PAYLOAD_V2:
                    this.message_buffer_uint8_view[this.message_length_received] = chunk;
                    this.message_length_received++;

                    if (this.message_length_received >= this.message_length_expected) {
                        this.state =
                            this.state === this.decoder_states.PAYLOAD_V1
                                ? this.decoder_states.CHECKSUM_V1
                                : this.decoder_states.CHECKSUM_V2;
                    }
                    break;
                case this.decoder_states.CHECKSUM_V1:
                    if (this.message_length_expected >= this.constants.JUMBO_FRAME_MIN_SIZE) {
                        this.message_checksum = this.constants.JUMBO_FRAME_MIN_SIZE;
                    } else {
                        this.message_checksum = this.message_length_expected;
                    }
                    this.message_checksum ^= this.code;
                    if (this.message_length_expected >= this.constants.JUMBO_FRAME_MIN_SIZE) {
                        this.message_checksum ^= this.message_length_expected & 0xff;
                        this.message_checksum ^= (this.message_length_expected & 0xff00) >> 8;
                    }
                    for (let ii = 0; ii < this.message_length_received; ii++) {
                        this.message_checksum ^= this.message_buffer_uint8_view[ii];
                    }
                    this._dispatch_message(chunk);
                    break;
                case this.decoder_states.CHECKSUM_V2:
                    this.message_checksum = 0;
                    this.message_checksum = this.crc8_dvb_s2(this.message_checksum, 0); // flag
                    this.message_checksum = this.crc8_dvb_s2(this.message_checksum, this.code & 0xff);
                    this.message_checksum = this.crc8_dvb_s2(this.message_checksum, (this.code & 0xff00) >> 8);
                    this.message_checksum = this.crc8_dvb_s2(
                        this.message_checksum,
                        this.message_length_expected & 0xff,
                    );
                    this.message_checksum = this.crc8_dvb_s2(
                        this.message_checksum,
                        (this.message_length_expected & 0xff00) >> 8,
                    );
                    for (let ii = 0; ii < this.message_length_received; ii++) {
                        this.message_checksum = this.crc8_dvb_s2(
                            this.message_checksum,
                            this.message_buffer_uint8_view[ii],
                        );
                    }
                    this._dispatch_message(chunk);
                    break;
                default:
                    console.log(`Unknown state detected: ${this.state}`);
            }
        }
        this.last_received_timestamp = Date.now();
    },
    _initialize_read_buffer() {
        this.message_buffer = new ArrayBuffer(this.message_length_expected);
        this.message_buffer_uint8_view = new Uint8Array(this.message_buffer);
    },

    _dispatch_message(expectedChecksum) {
        if (this.message_checksum === expectedChecksum) {
            // message received, store dataview
            this.dataView = new DataView(this.message_buffer, 0, this.message_length_expected);
        } else if (serial._protocol?.shouldBypassCrc?.(expectedChecksum)) {
            // Capability check: only the Bluetooth protocols implement shouldBypassCrc,
            // for BT-11/CC2541 bridges that corrupt the MSP checksum to 0xff. Not gated
            // on serial.protocol — that getter returns the lowercased constructor name,
            // never "bluetooth".
            this.dataView = new DataView(this.message_buffer, 0, this.message_length_expected);
            this.crcError = false; // Override the CRC error for this specific case
        } else {
            this.packet_error++;
            this.crcError = true;
            this.dataView = new DataView(new ArrayBuffer(0));
        }
        this.notify();
        // Reset variables
        this.message_length_received = 0;
        this.state = 0;
        this.crcError = false;
    },
    notify() {
        this.listeners.forEach((listener) => {
            listener(this);
        });
    },
    listen(listener) {
        if (this.listeners.indexOf(listener) === -1) {
            this.listeners.push(listener);
        }
    },
    clearListeners() {
        this.listeners = [];
    },
    crc8_dvb_s2(crc, ch) {
        crc ^= ch;
        for (let ii = 0; ii < 8; ii++) {
            if (crc & 0x80) {
                crc = ((crc << 1) & 0xff) ^ 0xd5;
            } else {
                crc = (crc << 1) & 0xff;
            }
        }
        return crc;
    },
    crc8_dvb_s2_data(data, start, end) {
        let crc = 0;
        for (let ii = start; ii < end; ii++) {
            crc = this.crc8_dvb_s2(crc, data[ii]);
        }
        return crc;
    },
    encode_message_v1(code, data) {
        const dataLength = data ? data.length : 0;
        // always reserve 6 bytes for protocol overhead !
        const bufferSize = dataLength + 6;
        const bufferOut = new ArrayBuffer(bufferSize);
        const bufView = new Uint8Array(bufferOut);

        bufView[0] = 36; // $
        bufView[1] = 77; // M
        bufView[2] = 60; // <
        bufView[3] = dataLength;
        bufView[4] = code;

        let checksum = bufView[3] ^ bufView[4];

        for (let i = 0; i < dataLength; i++) {
            bufView[i + 5] = data[i];
            checksum ^= bufView[i + 5];
        }

        bufView[5 + dataLength] = checksum;
        return bufferOut;
    },
    encode_message_v2(code, data) {
        const dataLength = data ? data.length : 0;
        // 9 bytes for protocol overhead
        const bufferSize = dataLength + 9;
        const bufferOut = new ArrayBuffer(bufferSize);
        const bufView = new Uint8Array(bufferOut);
        bufView[0] = 36; // $
        bufView[1] = 88; // X
        bufView[2] = 60; // <
        bufView[3] = 0; // flag
        bufView[4] = code & 0xff;
        bufView[5] = (code >> 8) & 0xff;
        bufView[6] = dataLength & 0xff;
        bufView[7] = (dataLength >> 8) & 0xff;
        for (let ii = 0; ii < dataLength; ii++) {
            bufView[8 + ii] = data[ii];
        }
        bufView[bufferSize - 1] = this.crc8_dvb_s2_data(bufView, 3, bufferSize - 1);
        return bufferOut;
    },
    encode_message_cli(str) {
        const data = Array.from(str, (c) => c.charCodeAt(0));
        const dataLength = data ? data.length : 0;
        const bufferSize = dataLength + 3; // 3 bytes for protocol overhead
        const bufferOut = new ArrayBuffer(bufferSize);
        const bufView = new Uint8Array(bufferOut);
        bufView[0] = this.symbols.START_OF_TEXT; // STX
        for (let ii = 0; ii < dataLength; ii++) {
            bufView[1 + ii] = data[ii];
        }
        bufView[bufferSize - 2] = this.symbols.LINE_FEED; // LF
        bufView[bufferSize - 1] = this.symbols.END_OF_TEXT; // ETX
        return bufferOut;
    },
    send_cli_command(str, callback, { timeoutMs } = {}) {
        this.cli_queue.push({ command: str, callback, timeoutMs });
        this._process_cli_queue();
    },
    _process_cli_queue() {
        if (this.cli_in_flight || this.cli_queue.length === 0) {
            return;
        }

        const entry = this.cli_queue.shift();
        this.cli_in_flight = entry;
        this.cli_buffer.length = 0;
        this.cli_output.length = 0;

        this.cli_callback = (lines) => {
            this._finish_cli([...lines], null);
        };

        if (entry.timeoutMs) {
            this.cli_timer = setTimeout(() => {
                this._finish_cli(
                    [],
                    new Error(`Timed out after ${entry.timeoutMs}ms waiting for response to "${entry.command}"`),
                );
            }, entry.timeoutMs);
        }

        serial.send(this.encode_message_cli(entry.command));
    },
    _finish_cli(lines, error) {
        const entry = this.cli_in_flight;
        if (!entry) {
            return;
        }

        this.cli_in_flight = null;
        this.cli_callback = null;
        this.cli_buffer.length = 0;
        this.cli_output.length = 0;

        if (this.cli_timer) {
            clearTimeout(this.cli_timer);
            this.cli_timer = null;
        }

        try {
            entry.callback?.(lines, error);
        } catch (callbackError) {
            console.error("CLI callback threw:", callbackError);
        }

        if (error) {
            // Drain any in-flight or soon-to-arrive response before sending the
            // next command; the decoder will end drain on ETX, otherwise the
            // grace timer forces progress.
            this.cli_discarding = true;
            if (this.cli_drain_timer) {
                clearTimeout(this.cli_drain_timer);
            }
            this.cli_drain_timer = setTimeout(() => this._end_cli_drain(), this.cli_drain_grace_ms);
            return;
        }

        this._process_cli_queue();
    },
    _end_cli_drain() {
        if (this.cli_drain_timer) {
            clearTimeout(this.cli_drain_timer);
            this.cli_drain_timer = null;
        }
        this.cli_discarding = false;
        this.cli_buffer.length = 0;
        this.cli_output.length = 0;
        this.state = this.decoder_states.IDLE;
        this._process_cli_queue();
    },
    _drain_cli_queue(error) {
        if (this.cli_timer) {
            clearTimeout(this.cli_timer);
            this.cli_timer = null;
        }
        if (this.cli_drain_timer) {
            clearTimeout(this.cli_drain_timer);
            this.cli_drain_timer = null;
        }

        const pending = this.cli_queue.splice(0, this.cli_queue.length);
        const inFlight = this.cli_in_flight;
        this.cli_in_flight = null;
        this.cli_callback = null;
        this.cli_buffer.length = 0;
        this.cli_output.length = 0;
        this.cli_discarding = false;

        for (const entry of [inFlight, ...pending]) {
            if (!entry?.callback) {
                continue;
            }
            try {
                entry.callback([], error);
            } catch (callbackError) {
                console.error("CLI callback threw during drain:", callbackError);
            }
        }
    },
    send_message(code, data, callback_sent, callback_msp) {
        if (code === undefined || !serial.connected || CONFIGURATOR.virtualMode) {
            if (callback_msp) {
                callback_msp();
            }
            return false;
        }

        return this._transmit(code, data, callback_sent, callback_msp, false);
    },
    _buffer_matches(entry, view) {
        if (entry.requestBuffer?.byteLength !== view.byteLength) {
            return false;
        }
        const entryView = new Uint8Array(entry.requestBuffer);
        for (let i = 0; i < view.byteLength; i++) {
            if (entryView[i] !== view[i]) {
                return false;
            }
        }
        return true;
    },
    _transmit(code, data, callback_sent, callback_msp, errorAware) {
        const bufferOut = code <= 254 ? this.encode_message_v1(code, data) : this.encode_message_v2(code, data);
        const view = new Uint8Array(bufferOut);

        // Per-code serialisation: an errorAware request whose code matches an in-flight
        // errorAware entry with a DIFFERENT buffer parks behind it (identical buffers
        // dedup and attach instead). Same-code legacy entries never cause parking.
        if (errorAware) {
            const differentInFlight = this.callbacks.some(
                (i) => i.errorAware && i.code === code && !this._buffer_matches(i, view),
            );
            if (differentInFlight) {
                this._park(code, {
                    code,
                    requestBuffer: bufferOut,
                    callback: callback_msp,
                    callbackSent: callback_sent,
                    errorAware: true,
                });
                return true;
            }
        }

        const requestExists = this.callbacks.some((i) => i.code === code && this._buffer_matches(i, view));

        const obj = {
            code,
            requestBuffer: bufferOut,
            callback: callback_msp,
            callbackSent: callback_sent,
            errorAware,
            attempts: 1,
            start: performance.now(),
        };

        // errorAware entries always arm their own timer (even when deduped) so an awaiter
        // that attached onto a stalled request still settles.
        if (errorAware || !requestExists) {
            this._arm_timer(obj);
        }

        this.callbacks.push(obj);

        // always send messages with data payload (even when there is a message already in the queue)
        if (data || !requestExists) {
            serial.send(bufferOut, (sendInfo) => {
                if (sendInfo.bytesSent === bufferOut.byteLength && callback_sent) {
                    callback_sent();
                }
            });
        }

        return true;
    },
    _arm_timer(obj) {
        obj.timer = setTimeout(() => this._on_timeout(obj), this.TIMEOUT);
    },
    _on_timeout(obj) {
        if (obj.attempts < this.MAX_RETRIES) {
            obj.attempts++;
            console.warn(
                `MSP: data request timed-out: ${obj.code} ID: ${serial.connectionId} TAB: ${GUI.active_tab} QUEUE: ${this.callbacks.length} (${this.callbacks.map((e) => e.code)})`,
            );
            serial.send(obj.requestBuffer);
            this._arm_timer(obj);
            return;
        }

        clearTimeout(obj.timer);
        obj.timer = null;

        if (!obj.errorAware) {
            // legacy: give up retrying but leave the entry queued so a late response still fires it
            return;
        }

        const index = this.callbacks.indexOf(obj);
        if (index !== -1) {
            this.callbacks.splice(index, 1);
        }
        try {
            obj.callback?.(null, new MspTimeoutError(`MSP request timed out: ${obj.code}`, obj.code));
        } catch (callbackError) {
            console.error("MSP callback threw on timeout:", callbackError);
        }
        this._release_parked(obj.code);

        // MAX_RETRIES sends produced no response: the link is unresponsive, not just slow.
        this.onTimeout?.(obj.code);
    },
    _park(code, entry) {
        let queue = this.parked.get(code);
        if (!queue) {
            queue = [];
            this.parked.set(code, queue);
        }
        queue.push(entry);
    },
    _release_parked(code) {
        const queue = this.parked.get(code);
        if (!queue || queue.length === 0) {
            return;
        }
        if (this.callbacks.some((i) => i.errorAware && i.code === code)) {
            return;
        }

        const entry = queue.shift();
        if (queue.length === 0) {
            this.parked.delete(code);
        }

        entry.attempts = 1;
        entry.start = performance.now();
        this._arm_timer(entry);
        this.callbacks.push(entry);

        serial.send(entry.requestBuffer, (sendInfo) => {
            if (sendInfo.bytesSent === entry.requestBuffer.byteLength && entry.callbackSent) {
                entry.callbackSent();
            }
        });
    },
    /**
     * resolves: {command: code, data: data, length: message_length}
     * rejects: MspTimeoutError, MspCancelledError or MspCrcError
     */
    async promise(code, data) {
        if (code === undefined || CONFIGURATOR.virtualMode) {
            return undefined;
        }

        if (!serial.connected) {
            throw new MspCancelledError("MSP request while disconnected", code, "disconnected");
        }

        return new Promise((resolve, reject) => {
            this._transmit(
                code,
                data,
                false,
                (response, error) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(response);
                    }
                },
                true,
            );
        });
    },
    callbacks_cleanup(error = new MspCancelledError("MSP queue cleared", undefined, "cleanup")) {
        const pending = this.callbacks;
        this.callbacks = [];

        const parked = [];
        for (const queue of this.parked.values()) {
            parked.push(...queue);
        }
        this.parked.clear();

        for (const entry of pending) {
            clearTimeout(entry.timer);
        }

        for (const entry of [...pending, ...parked]) {
            if (!entry.errorAware) {
                continue;
            }
            try {
                entry.callback?.(null, error);
            } catch (callbackError) {
                console.error("MSP callback threw during cleanup:", callbackError);
            }
        }
    },
    disconnect_cleanup() {
        this.state = 0; // reset packet state for "clean" initial entry (this is only required if user hot-disconnects)
        this.packet_error = 0; // reset CRC packet error counter for next session

        this.callbacks_cleanup(new MspCancelledError("Serial connection closed", undefined, "disconnected"));
        // Tag the error so callers can distinguish an EXPECTED close-driven drain — a `save`/
        // `exit` reboots the FC, closing the port before it can reply — from a genuine command
        // failure. The save still succeeded; the board is just restarting.
        const closedError = new Error("Serial connection closed");
        closedError.connectionClosed = true;
        this._drain_cli_queue(closedError);
    },
};

MSP.SDCARD_STATE_NOT_PRESENT = 0;
MSP.SDCARD_STATE_FATAL = 1;
MSP.SDCARD_STATE_CARD_INIT = 2;
MSP.SDCARD_STATE_FS_INIT = 3;
MSP.SDCARD_STATE_READY = 4;

window.MSP = MSP;
export default MSP;
