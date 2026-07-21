import { Transport } from "esptool-js";

function appendArray(first, second) {
    const output = new Uint8Array(first.length + second.length);
    output.set(first);
    output.set(second, first.length);
    return output;
}

function trimBytes(bytes, maxLength) {
    if (bytes.byteLength <= maxLength) {
        return bytes;
    }
    return bytes.slice(bytes.byteLength - maxLength);
}

export default class ElrsWebFlasherTransport extends Transport {
    constructor(device, tracing = false) {
        super(device, tracing);
        this.delimiters = [];
        this.recentInput = new Uint8Array(0);
    }

    remember(bytes) {
        const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        this.recentInput = trimBytes(appendArray(this.recentInput, input), 4096);
    }

    recentText() {
        return new TextDecoder("utf-8")
            .decode(this.recentInput)
            .replace(/[^\x09\x0a\x0d\x20-\x7e]+/g, " ")
            .trim();
    }

    ui8ToBstr(u8Array) {
        let bStr = "";
        for (let i = 0; i < u8Array.length; i++) {
            bStr += String.fromCharCode(u8Array[i]);
        }
        return bStr;
    }

    bstrToUi8(bStr) {
        const output = new Uint8Array(bStr.length);
        for (let i = 0; i < bStr.length; i++) {
            output[i] = bStr.charCodeAt(i);
        }
        return output;
    }

    setDelimiters(delimiters = ["\n", "CCC"]) {
        this.delimiters = delimiters.map((delimiter) => this.bstrToUi8(delimiter));
    }

    findDelimiter(packet) {
        const index = packet.findIndex((_, i, bytes) =>
            this.delimiters.some((delimiter) => delimiter.every((value, j) => bytes[i + j] === value)),
        );
        if (index === -1) {
            return -1;
        }
        const delimiter = this.delimiters.find((candidate) =>
            candidate.every((value, j) => packet[index + j] === value),
        );
        return index + delimiter.length;
    }

    async readLine(timeout = 0) {
        let timer = null;
        let timedOut = false;
        let packet = this.buffer;
        this.buffer = new Uint8Array(0);
        let index = this.findDelimiter(packet);

        if (index === -1) {
            if (!this.reader && this.device?.readable) {
                this.reader = this.device.readable.getReader();
            }
            const reader = this.reader;
            if (!reader) {
                return "";
            }

            try {
                if (timeout > 0) {
                    timer = setTimeout(() => {
                        timedOut = true;
                        void reader.cancel().catch(() => {});
                    }, timeout);
                }

                do {
                    let result;
                    try {
                        result = await reader.read();
                    } catch (error) {
                        if (timedOut) {
                            reader.releaseLock();
                            this.reader = undefined;
                            return "";
                        }
                        throw error;
                    }

                    const { value, done } = result;
                    if (done) {
                        if (timedOut) {
                            reader.releaseLock();
                            this.reader = undefined;
                            return "";
                        }
                        await this.disconnect();
                        await this.connect(this.baudrate);
                        return "";
                    }

                    const input = value instanceof Uint8Array ? value : new Uint8Array(value);
                    this.remember(input);
                    packet = appendArray(packet, input);
                    index = this.findDelimiter(packet);
                } while (index === -1);
            } finally {
                if (timer) {
                    clearTimeout(timer);
                }
            }
        }

        this.buffer = packet.slice(index);
        const line = packet.slice(0, index);
        this.remember(line);
        return this.ui8ToBstr(line);
    }

    async writeString(data) {
        await this.writeArray(this.bstrToUi8(data));
    }

    async writeArray(data) {
        const writer = this.device.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
    }

    async read(timeout) {
        const packet = await super.read(timeout);
        if (packet?.byteLength) {
            this.remember(packet);
        }
        return packet;
    }
}
