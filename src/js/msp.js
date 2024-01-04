import GUI from "./gui.js";
import CONFIGURATOR from "./data_storage.js";
import serialNWJS from "./serial.js";
import serialWeb from "./webSerial.js";
import { isWeb } from "./utils/isWeb.js";

const serial = isWeb() ? serialWeb : serialNWJS;

const MSP = {
    symbols: {
        BEGIN: '$'.charCodeAt(0),
        PROTO_V1: 'M'.charCodeAt(0),
        PROTO_V2: 'X'.charCodeAt(0),
        FROM_MWC: '>'.charCodeAt(0),
        TO_MWC: '<'.charCodeAt(0),
        UNSUPPORTED: '!'.charCodeAt(0),
    },
    constants: {
        PROTOCOL_V1:                1,
        PROTOCOL_V2:                2,
        JUMBO_FRAME_MIN_SIZE:       255,
    },
    decoder_states: {
        IDLE:                       0,
        PROTO_IDENTIFIER:           1,
        DIRECTION_V1:               2,
        DIRECTION_V2:               3,
        FLAG_V2:                    4,
        PAYLOAD_LENGTH_V1:          5,
        PAYLOAD_LENGTH_JUMBO_LOW:   6,
        PAYLOAD_LENGTH_JUMBO_HIGH:  7,
        PAYLOAD_LENGTH_V2_LOW:      8,
        PAYLOAD_LENGTH_V2_HIGH:     9,
        CODE_V1:                    10,
        CODE_JUMBO_V1:              11,
        CODE_V2_LOW:                12,
        CODE_V2_HIGH:               13,
        PAYLOAD_V1:                 14,
        PAYLOAD_V2:                 15,
        CHECKSUM_V1:                16,
        CHECKSUM_V2:                17,
    },
    state:                      0,
    message_direction:          1,
    code:                       0,
    dataView:                   0,
    message_length_expected:    0,
    message_length_received:    0,
    message_buffer:             null,
    message_buffer_uint8_view:  null,
    message_checksum:           0,
    messageIsJumboFrame:        false,
    crcError:                   false,

    callbacks:                  [],
    packet_error:               0,
    unsupported:                0,

    MIN_TIMEOUT:                100,
    MAX_TIMEOUT:                2000,
    timeout:                    200,

    last_received_timestamp:   null,
    listeners:                  [],

    JUMBO_FRAME_SIZE_LIMIT:     255,

    read(readInfo) {
        if (CONFIGURATOR.virtualMode) {
            return;
        }

        const data = new Uint8Array(readInfo.data ?? readInfo);

        for (const chunk of data) {
            switch (this.state) {
            case this.decoder_states.IDLE: // sync char 1
                if (chunk === this.symbols.BEGIN) {
                    this.state = this.decoder_states.PROTO_IDENTIFIER;
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
                this.state = this.state === this.decoder_states.DIRECTION_V1 ?
                        this.decoder_states.PAYLOAD_LENGTH_V1 :
                        this.decoder_states.FLAG_V2;
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
                this.state = this.message_length_expected > 0 ?
                    this.decoder_states.PAYLOAD_V2 :
                    this.decoder_states.CHECKSUM_V2;
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
                    this.state = this.state === this.decoder_states.PAYLOAD_V1 ?
                        this.decoder_states.CHECKSUM_V1 :
                        this.decoder_states.CHECKSUM_V2;
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
                    this.message_checksum ^= this.message_length_expected & 0xFF;
                    this.message_checksum ^= (this.message_length_expected & 0xFF00) >> 8;
                }
                for (let ii = 0; ii < this.message_length_received; ii++) {
                    this.message_checksum ^= this.message_buffer_uint8_view[ii];
                }
                this._dispatch_message(chunk);
                break;
            case this.decoder_states.CHECKSUM_V2:
                this.message_checksum = 0;
                this.message_checksum = this.crc8_dvb_s2(this.message_checksum, 0); // flag
                this.message_checksum = this.crc8_dvb_s2(this.message_checksum, this.code & 0xFF);
                this.message_checksum = this.crc8_dvb_s2(this.message_checksum, (this.code & 0xFF00) >> 8);
                this.message_checksum = this.crc8_dvb_s2(this.message_checksum, this.message_length_expected & 0xFF);
                this.message_checksum = this.crc8_dvb_s2(this.message_checksum, (this.message_length_expected & 0xFF00) >> 8);
                for (let ii = 0; ii < this.message_length_received; ii++) {
                    this.message_checksum = this.crc8_dvb_s2(this.message_checksum, this.message_buffer_uint8_view[ii]);
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
        } else {
            this.packet_error++;
            this.crcError = true;
            this.dataView = new DataView(new ArrayBuffer(0));
        }
        this.notify();
        // Reset variables
        this.message_length_received = 0;
        this.state = 0;
        this.messageIsJumboFrame = false;
        this.crcError = false;
    },
    notify() {
        this.listeners.forEach((listener) => {
            listener(this);
        });
    },
    listen(listener) {
        if (this.listeners.indexOf(listener) == -1) {
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
                crc = ((crc << 1) & 0xFF) ^ 0xD5;
            } else {
                crc = (crc << 1) & 0xFF;
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
        let bufferOut = new ArrayBuffer(bufferSize);
        let bufView = new Uint8Array(bufferOut);

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
        bufView[3] = 0;  // flag
        bufView[4] = code & 0xFF;
        bufView[5] = (code >> 8) & 0xFF;
        bufView[6] = dataLength & 0xFF;
        bufView[7] = (dataLength >> 8) & 0xFF;
        for (let ii = 0; ii < dataLength; ii++) {
            bufView[8 + ii] = data[ii];
        }
        bufView[bufferSize - 1] = this.crc8_dvb_s2_data(bufView, 3, bufferSize - 1);
        return bufferOut;
    },
    send_message(code, data, callback_sent, callback_msp, doCallbackOnError) {
        const connected = isWeb ? serial.connected : serial.connectionId;
        if (code === undefined || !connected || CONFIGURATOR.virtualMode) {
            if (callback_msp) {
                callback_msp();
            }
            return false;
        }

        let requestExists = false;
        for (const instance of this.callbacks) {
            if (instance.code === code) {
                requestExists = true;

                break;
            }
        }

        if (isWeb() && (code === undefined || !serial.connectionInfo)) {
          console.log('ERROR: code undefined or no connectionId');
          return false;
        }


        const bufferOut = code <= 254 ? this.encode_message_v1(code, data) : this.encode_message_v2(code, data);

        const obj = {
            'code': code,
            'requestBuffer': bufferOut,
            'callback': callback_msp,
            'callbackOnError': doCallbackOnError,
            'start': performance.now(),
        };

        if (!requestExists) {
            obj.timer = setTimeout(() => {
                console.warn(`MSP: data request timed-out: ${code} ID: ${serial.connectionId} TAB: ${GUI.active_tab} TIMEOUT: ${this.timeout} QUEUE: ${this.callbacks.length} (${this.callbacks.map((e) => e.code)})`);
                serial.send(bufferOut, (_sendInfo) => {
                    obj.stop = performance.now();
                    const executionTime = Math.round(obj.stop - obj.start);
                    this.timeout = Math.max(this.MIN_TIMEOUT, Math.min(executionTime, this.MAX_TIMEOUT));
                });
            }, this.timeout);
        }

        this.callbacks.push(obj);

        // always send messages with data payload (even when there is a message already in the queue)
        if (data || !requestExists) {
            if (this.timeout > this.MIN_TIMEOUT) {
                this.timeout--;
            }

            serial.send(bufferOut, (sendInfo) => {
                if (sendInfo.bytesSent === bufferOut.byteLength) {
                    if (callback_sent) {
                        callback_sent();
                    }
                }
            });
        }

        return true;
    },

    /**
     * resolves: {command: code, data: data, length: message_length}
     */
    async promise(code, data) {
        return new Promise((resolve) => {
            this.send_message(code, data, false, (_data) => {
                resolve(_data);
            });
        });
    },
    callbacks_cleanup() {
        for (const callback of this.callbacks) {
            clearTimeout(callback.timer);
        }

        this.callbacks = [];
    },
    disconnect_cleanup() {
        this.state = 0; // reset packet state for "clean" initial entry (this is only required if user hot-disconnects)
        this.packet_error = 0; // reset CRC packet error counter for next session

        this.callbacks_cleanup();
    },
};

MSP.SDCARD_STATE_NOT_PRESENT = 0;
MSP.SDCARD_STATE_FATAL       = 1;
MSP.SDCARD_STATE_CARD_INIT   = 2;
MSP.SDCARD_STATE_FS_INIT     = 3;
MSP.SDCARD_STATE_READY       = 4;

window.MSP = MSP;
export default MSP;
