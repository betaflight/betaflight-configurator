import { ESPLoader, Transport } from "esptool-js";

class MismatchError extends Error {}

class WrongMcuError extends Error {}

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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function platformForDetectedChip(chip) {
    const normalizedChip = String(chip || "").toUpperCase();
    if (normalizedChip.includes("ESP32-C2")) {
        return "esp32-c2";
    }
    if (normalizedChip.includes("ESP32-C3")) {
        return "esp32-c3";
    }
    if (normalizedChip.includes("ESP32-C6")) {
        return "esp32-c6";
    }
    if (normalizedChip.includes("ESP32-H2")) {
        return "esp32-h2";
    }
    if (normalizedChip.includes("ESP32-S2")) {
        return "esp32-s2";
    }
    if (normalizedChip.includes("ESP32-S3")) {
        return "esp32-s3";
    }
    if (normalizedChip.includes("ESP32")) {
        return "esp32";
    }
    if (normalizedChip.includes("ESP8266") || normalizedChip.includes("ESP8285")) {
        return "esp8285";
    }
    return "";
}

function normalizeEspPlatform(platform) {
    const normalized = String(platform || "").toLowerCase();
    if (normalized === "esp32c2") {
        return "esp32-c2";
    }
    if (normalized === "esp32c3") {
        return "esp32-c3";
    }
    if (normalized === "esp32c6") {
        return "esp32-c6";
    }
    if (normalized === "esp32h2") {
        return "esp32-h2";
    }
    if (normalized === "esp32s2") {
        return "esp32-s2";
    }
    if (normalized === "esp32s3") {
        return "esp32-s3";
    }
    return normalized;
}

function assertDetectedChipMatchesTarget(chip, target) {
    const detectedPlatform = platformForDetectedChip(chip);
    const targetPlatform = normalizeEspPlatform(target?.platform);
    if (!detectedPlatform || !targetPlatform) {
        return;
    }
    if (detectedPlatform !== targetPlatform) {
        throw new WrongMcuError(`Wrong GIGLRS target selected: detected ${chip}, but ${target.productName} is ${target.platform}.`);
    }
}

export class TransportEx extends Transport {
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

    set_delimiters(delimiters = ["\n", "CCC"]) {
        this.delimiters = delimiters.map((delimiter) => this.bstrToUi8(delimiter));
    }

    findDelimiter(packet) {
        const index = packet.findIndex((_, i, bytes) => {
            for (const delimiter of this.delimiters) {
                if (delimiter.every((value, j) => bytes[i + j] === value)) {
                    return true;
                }
            }
            return false;
        });
        if (index === -1) {
            return -1;
        }
        for (const delimiter of this.delimiters) {
            if (delimiter.every((value, j) => packet[index + j] === value)) {
                return index + delimiter.length;
            }
        }
        return -1;
    }

    read_line = async (timeout = 0) => {
        let timer;
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
                throw new Error("Serial reader unavailable");
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
                if (timeout > 0) {
                    clearTimeout(timer);
                }
            }
        }

        this.buffer = packet.slice(index);
        const line = packet.slice(0, index);
        this.remember(line);
        return this.ui8ToBstr(line);
    };

    write_string = async (data) => {
        const writer = this.device.writable.getWriter();
        const output = this.bstrToUi8(data);
        await writer.write(output.buffer);
        writer.releaseLock();
    };

    write_array = async (data) => {
        const writer = this.device.writable.getWriter();
        await writer.write(data.buffer);
        writer.releaseLock();
    };
}

class Bootloader {
    static INIT_SEQ = {
        CRSF: [0xec, 0x04, 0x32, this.ord("b"), this.ord("l")],
        GHST: [0x89, 0x04, 0x32, this.ord("b"), this.ord("l")],
    };

    static ord(value) {
        return value.charCodeAt(0);
    }

    static calc_crc8(payload, poly = 0xd5) {
        let crc = 0;
        for (let pos = 0; pos < payload.byteLength; pos++) {
            crc ^= payload[pos];
            for (let j = 0; j < 8; ++j) {
                if ((crc & 0x80) !== 0) {
                    crc = ((crc << 1) ^ poly) % 256;
                } else {
                    crc = (crc << 1) % 256;
                }
            }
        }
        return crc;
    }

    static get_telemetry_seq(seq, key = null) {
        const payload = new Uint8Array(seq);
        let keyBytes = new Uint8Array(0);
        if (key != null) {
            keyBytes = new Uint8Array(key.length);
            for (let i = 0; i < key.length; i++) {
                keyBytes[i] = key.charCodeAt(i);
            }
        }
        const output = new Uint8Array(payload.byteLength + keyBytes.byteLength + 1);
        output.set(payload, 0);
        output.set([payload[1] + keyBytes.byteLength], 1);
        output.set(keyBytes, payload.byteLength);
        const crc = this.calc_crc8(output.slice(2, output.byteLength - 1));
        output.set([crc], payload.byteLength + keyBytes.byteLength);
        return output;
    }

    static get_init_seq(module, key = null) {
        return this.get_telemetry_seq(this.INIT_SEQ[module], key);
    }
}

class Passthrough {
    constructor(transport, terminal, flashTarget, baudrate, halfDuplex = false, uploadForce = false) {
        this.transport = transport;
        this.terminal = terminal;
        this.flash_target = flashTarget;
        this.baudrate = baudrate;
        this.half_duplex = halfDuplex;
        this.uploadforce = uploadForce;
    }

    log(message) {
        this.terminal.writeln(message);
    }

    _validate_serialrx = async (config, expected) => {
        await this.transport.write_string(`get ${config}\r\n`);
        const line = await this.transport.read_line(100);
        return expected.some((key) => line.trim().includes(` = ${key}`));
    };

    betaflight = async () => {
        this.log("Initializing FC passthrough");

        await this.transport.write_string("#");
        this.transport.set_delimiters(["# ", "CCC"]);
        const line = await this.transport.read_line(200);
        if (line.includes("CCC")) {
            this.log("Passthrough already enabled and bootloader active");
            return;
        }
        if (!line.trim().endsWith("#")) {
            this.log("No CLI prompt detected; assuming passthrough is already active");
            return;
        }

        this.transport.set_delimiters(["# "]);
        const serialCheck = [];
        if (!(await this._validate_serialrx("serialrx_provider", ["CRSF", "ELRS"]))) {
            serialCheck.push("Serial Receiver Protocol is not set to CRSF/ELRS.");
        }
        if (!(await this._validate_serialrx("serialrx_inverted", ["OFF"]))) {
            serialCheck.push("Serial Receiver UART is inverted.");
        }
        if (!(await this._validate_serialrx("serialrx_halfduplex", ["OFF", "AUTO"]))) {
            serialCheck.push("Serial Receiver UART is not full duplex.");
        }
        if (serialCheck.length > 0) {
            this.log("[ERROR] Invalid serial RX configuration detected:");
            for (const item of serialCheck) {
                this.log(`    ${item}`);
            }
            throw new Error(serialCheck.join(" "));
        }

        this.log("\nAttempting to detect FC UART configuration...");
        await this.transport.write_string("serial\r\n");
        this.transport.set_delimiters(["\n"]);
        let index = false;
        while (true) {
            const serialLine = await this.transport.read_line(200);
            if (serialLine === "") {
                break;
            }
            if (serialLine.startsWith("serial")) {
                const config = serialLine.match(/serial (?<port>(UART)?[0-9]+) (?<port_cfg>[0-9]+) /);
                if (
                    config?.groups?.port &&
                    config.groups.port_cfg &&
                    (Number.parseInt(config.groups.port_cfg, 10) & 64) === 64
                ) {
                    index = config.groups.port;
                    break;
                }
            }
        }
        if (!index) {
            throw new Error("RX Serial not found. Check Betaflight/GIGFlight UART configuration.");
        }

        await this.transport.write_string(`serialpassthrough ${index} ${this.transport.baudrate}\r\n`);
        await sleep(200);

        try {
            for (let i = 0; i < 10; i++) {
                await this.transport.read_line(200);
            }
        } catch {
            // Official web-flasher ignores cleanup reads here; passthrough may already be raw.
        }
        this.log("Passthrough initialization complete");
    };

    reset_to_bootloader = async () => {
        this.log("Reset to bootloader");

        if (this.half_duplex) {
            this.log("Using half duplex (GHST)");
            await this.transport.write_array(Bootloader.get_init_seq("GHST"));
        } else {
            this.log("Using full duplex (CRSF)");
            while ((await this.transport.read_line(100)) !== "") {}
            const train = new Uint8Array(32);
            train.fill(0x55);
            await this.transport.write_array(new Uint8Array([0x07, 0x07, 0x12, 0x20]));
            await this.transport.write_array(train);
            await sleep(200);
            await this.transport.write_array(Bootloader.get_init_seq("CRSF"));
            await sleep(200);
        }

        this.transport.set_delimiters(["\n"]);
        const rxTarget = (await this.transport.read_line(200)).trim();
        if (rxTarget === "") {
            this.log("Cannot detect RX target, blindly flashing");
        } else if (this.uploadforce) {
            this.log(`Force flashing ${this.flash_target}, detected ${rxTarget}`);
        } else if (rxTarget.toUpperCase() !== this.flash_target.toUpperCase()) {
            throw new MismatchError(`Wrong target selected: receiver is '${rxTarget}', selected '${this.flash_target}'.`);
        } else if (this.flash_target !== "") {
            this.log(`Verified RX target '${this.flash_target}'`);
        }
        this.log("Bootloader enabled");
        await sleep(500);
    };
}

export class OfficialElrsEspFlasher {
    constructor(device, target, { baudrate = 420000, terminal, calculateMd5Hash } = {}) {
        this.device = device;
        this.target = target;
        this.baudrate = baudrate;
        this.terminal = terminal;
        this.calculateMd5Hash = calculateMd5Hash;
        this.transport = new TransportEx(device, false);
    }

    async connect() {
        const terminal = {
            clean: () => {},
            writeLine: (data) => this.terminal?.writeLine?.(data),
            write: (data) => this.terminal?.write?.(data),
            writeln: (data) => this.terminal?.writeLine?.(data),
        };
        this.esploader = new ESPLoader({
            transport: this.transport,
            baudrate: this.baudrate,
            terminal,
            romBaudrate: this.baudrate,
        });
        this.esploader.romBaudrate = this.baudrate;
        this.esploader.baudrate = this.baudrate;
        this.esploader.ESP_RAM_BLOCK = 0x0800;

        const passthrough = new Passthrough(this.transport, terminal, this.target?.firmware || "", this.baudrate);
        await this.transport.connect(this.baudrate);
        await passthrough.betaflight();
        await passthrough.reset_to_bootloader();
        await this.transport.disconnect();

        const chip = await this.esploader.main("no_reset");
        assertDetectedChipMatchesTarget(chip, this.target);
        return chip;
    }

    async flash(files, eraseAll, progress) {
        const loader = this.esploader;
        loader.FLASH_WRITE_SIZE = 0x0800;
        loader.IS_STUB = true;

        const fileArray = files.map((file) => ({
            data: file.data,
            address: file.address,
        }));

        await loader.writeFlash({
            fileArray,
            flashSize: "keep",
            flashMode: "keep",
            flashFreq: "keep",
            eraseAll,
            compress: true,
            reportProgress: progress,
            calculateMD5Hash: this.calculateMd5Hash,
        });

        progress?.(fileArray.length - 1, 100, 100);
        if (normalizeEspPlatform(this.target?.platform).startsWith("esp32")) {
            await loader.after("hard_reset").catch(() => {});
        } else {
            await loader.after("soft_reset").catch(() => {});
        }
    }

    recentText() {
        return this.transport.recentText();
    }

    async close() {
        await this.esploader?.transport?.disconnect?.();
    }
}
