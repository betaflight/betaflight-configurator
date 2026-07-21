const SLIP_END = 0xc0;
const SLIP_ESC = 0xdb;
const SLIP_ESC_END = 0xdc;
const SLIP_ESC_ESC = 0xdd;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendArray(first, second) {
    const output = new Uint8Array(first.length + second.length);
    output.set(first);
    output.set(second, first.length);
    return output;
}

export function crc8D5(payload) {
    let crc = 0;
    for (const data of payload) {
        crc ^= data;
        for (let i = 0; i < 8; i++) {
            crc = crc & 0x80 ? (crc << 1) ^ 0xd5 : crc << 1;
        }
    }
    return crc & 0xff;
}

export function elrsBootloaderInitSequence(key = "ESP82") {
    const keyBytes = new TextEncoder().encode(key);
    const payload = [0xec, 0x04 + keyBytes.length, 0x32, 0x62, 0x6c, ...keyBytes];
    payload.push(crc8D5(payload.slice(2)));
    return new Uint8Array(payload);
}

export class ElrsPassthroughTransport {
    constructor(passthrough, { tracing = false } = {}) {
        this.passthrough = passthrough;
        this.tracing = tracing;
        this.buffer = new Uint8Array(0);
        this.baudrate = 0;
        this.traceLog = "";
        this.lastTraceTime = Date.now();
        this.unsubscribe = passthrough.onData((bytes) => {
            this.buffer = appendArray(this.buffer, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
        });
    }

    getInfo() {
        return "Betaflight RX serial passthrough";
    }

    getPid() {
        return undefined;
    }

    trace(message) {
        if (!this.tracing) {
            return;
        }
        const delta = Date.now() - this.lastTraceTime;
        const line = `TRACE ${delta.toFixed(3)} ${message}`;
        console.log(line);
        this.traceLog += `${line}\n`;
    }

    async returnTrace() {
        return this.traceLog;
    }

    slipWriter(data) {
        const output = [SLIP_END];
        for (const byte of data) {
            if (byte === SLIP_ESC) {
                output.push(SLIP_ESC, SLIP_ESC_ESC);
            } else if (byte === SLIP_END) {
                output.push(SLIP_ESC, SLIP_ESC_END);
            } else {
                output.push(byte);
            }
        }
        output.push(SLIP_END);
        return new Uint8Array(output);
    }

    async write(data) {
        await this.passthrough.write(this.slipWriter(data));
    }

    async connect(baud = 115200) {
        this.baudrate = baud;
    }

    readLoop() {
        // Data is fed by the shared serial event listener registered in the constructor.
    }

    async disconnect() {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }

    async setRTS() {
        // The ESP is behind the flight controller UART, so hardware reset lines are not available.
    }

    async setDTR() {
        // The ELRS bootloader sequence is used instead of DTR/RTS reset.
    }

    flushInput() {
        this.buffer = new Uint8Array(0);
    }

    inWaiting() {
        return this.buffer.length;
    }

    peek() {
        return this.buffer;
    }

    async rawReadFor(timeoutMs = 750) {
        const deadline = Date.now() + timeoutMs;
        let output = new Uint8Array(0);
        while (Date.now() < deadline) {
            if (this.buffer.length > 0) {
                output = appendArray(output, this.buffer);
                this.buffer = new Uint8Array(0);
            }
            await sleep(10);
        }
        return output;
    }

    async read(timeout) {
        let partialPacket = null;
        let isEscaping = false;
        const deadline = Date.now() + timeout;

        while (Date.now() < deadline) {
            if (this.buffer.length === 0) {
                await sleep(1);
                continue;
            }

            const readBytes = this.buffer;
            this.buffer = new Uint8Array(0);

            for (let i = 0; i < readBytes.length; i++) {
                const byte = readBytes[i];
                if (partialPacket === null) {
                    if (byte === SLIP_END) {
                        partialPacket = new Uint8Array(0);
                    }
                    continue;
                }

                if (isEscaping) {
                    isEscaping = false;
                    if (byte === SLIP_ESC_END) {
                        partialPacket = appendArray(partialPacket, new Uint8Array([SLIP_END]));
                    } else if (byte === SLIP_ESC_ESC) {
                        partialPacket = appendArray(partialPacket, new Uint8Array([SLIP_ESC]));
                    } else {
                        throw new Error(`Invalid SLIP escape byte 0x${byte.toString(16)}`);
                    }
                } else if (byte === SLIP_ESC) {
                    isEscaping = true;
                } else if (byte === SLIP_END) {
                    if (i + 1 < readBytes.length) {
                        this.buffer = appendArray(readBytes.slice(i + 1), this.buffer);
                    }
                    return partialPacket;
                } else {
                    partialPacket = appendArray(partialPacket, new Uint8Array([byte]));
                }
            }
        }

        throw new Error(partialPacket === null ? "No serial data received." : "Timed out waiting for a full SLIP packet.");
    }
}
