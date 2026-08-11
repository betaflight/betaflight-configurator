/**
 * USB descriptor reading for DFU transports.
 *
 * Everything here is plain parsing on top of control transfers, so it is shared by
 * every DFU transport regardless of how the bytes are moved. A subclass supplies
 * `_rawControlTransferIn` and sets `logHead`, and must call
 * `_invalidateDescriptorCache()` whenever the underlying device changes.
 */
class UsbDfuDescriptors extends EventTarget {
    // DFU functional descriptor bDescriptorType. NOTE: 0x21 is shared with the HID
    // descriptor type, so a bare type match is ambiguous on composite devices — it must
    // be qualified by a preceding DFU interface descriptor (see getFunctionalDescriptor).
    static get DFU_FUNCTIONAL_DESCRIPTOR_TYPE() {
        return 0x21;
    }

    /**
     * Perform a control transfer IN, returning the raw bytes.
     * @abstract
     * @param {{requestType: string, recipient: string, request: number, value: number, index: number}} _setup
     * @param {number} _length - Maximum bytes to read.
     * @returns {Promise<{status: string, data: Uint8Array}>}
     */
    async _rawControlTransferIn(_setup, _length) {
        throw new Error("_rawControlTransferIn must be implemented by the transport");
    }

    /** Drops descriptors cached against the previous device. */
    _invalidateDescriptorCache() {
        this._langId = undefined;
        this._configDescriptor = undefined;
        // A read already awaiting a transfer when the device changes must not
        // land its (old-device) result in the new device's cache; each read
        // captures this generation and only caches while it still matches.
        this._descriptorGeneration = (this._descriptorGeneration ?? 0) + 1;
    }

    /**
     * Reject a USB operation that never settles, so a wedged device surfaces an
     * error instead of hanging the flash forever. Control transfers normally
     * complete in milliseconds, so this never fires during healthy operation.
     * @template T
     * @param {Promise<T>} promise - The USB operation to guard.
     * @param {number} timeoutMs - Timeout in milliseconds.
     * @param {string} label - Human-readable operation name for the timeout error.
     * @returns {Promise<T>} Resolves with the operation result, or rejects on timeout.
     */
    _withTimeout(promise, timeoutMs, label) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`${this.logHead} USB ${label} timed out after ${timeoutMs}ms`)),
                timeoutMs,
            );
        });
        // Promise.race already attaches a rejection reaction to `promise`, so a late USB
        // rejection (after the timeout won) is technically "handled" and won't surface as an
        // unhandledrejection. This explicit no-op catch documents that intent and keeps the
        // guarantee independent of Promise.race internals.
        promise.catch(() => {});
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    /**
     * Fetch the first supported LANGID from string descriptor 0.
     * Cached after the first successful read.
     * Falls back to 0x0409 (English US) on failure.
     */
    async getLangId() {
        if (this._langId !== undefined) {
            return this._langId;
        }

        const generation = this._descriptorGeneration ?? 0;
        const cache = (langId) => {
            if ((this._descriptorGeneration ?? 0) === generation) {
                this._langId = langId;
            }
            return langId;
        };

        try {
            const setup = {
                requestType: "standard",
                recipient: "device",
                request: 6,
                value: 0x300,
                index: 0,
            };

            const result = await this._withTimeout(this._rawControlTransferIn(setup, 255), 5000, "getLangId");
            if (result.status === "ok" && result.data.length >= 4) {
                return cache((result.data[3] << 8) | result.data[2]);
            }
        } catch (error) {
            console.warn(`${this.logHead} Failed to read LANGID, falling back to 0x0409:`, error);
        }

        return cache(0x0409);
    }

    async getString(index) {
        if (index === 0) {
            return "";
        }

        const langId = await this.getLangId();
        const setup = {
            requestType: "standard",
            recipient: "device",
            request: 6,
            value: 0x300 | index,
            index: langId,
        };

        const result = await this._withTimeout(this._rawControlTransferIn(setup, 255), 5000, `getString(${index})`);
        if (result.status === "ok") {
            const buf = result.data;
            const length = Math.min(buf[0], buf.length);
            let descriptor = "";
            for (let i = 2; i + 1 < length; i += 2) {
                descriptor += String.fromCodePoint((buf[i + 1] << 8) | buf[i]);
            }
            return descriptor;
        }
        throw new Error(`USB getString failed: ${result.status}`);
    }

    /**
     * Fetch the full configuration descriptor blob.
     * Cached for the lifetime of the current device connection.
     */
    async getConfigDescriptor() {
        if (this._configDescriptor) {
            return this._configDescriptor;
        }

        const generation = this._descriptorGeneration ?? 0;
        const setup = {
            requestType: "standard",
            recipient: "device",
            request: 6,
            value: 0x200,
            index: 0,
        };

        // First read the 9-byte config header to learn the total length
        const header = await this._withTimeout(
            this._rawControlTransferIn(setup, 9),
            5000,
            "getConfigDescriptor(header)",
        );
        if (header.status !== "ok") {
            throw new Error(`USB getConfigDescriptor failed: ${header.status}`);
        }
        // A transfer can succeed and still return fewer bytes than asked for. Without
        // this the length below reads past the end, comes out as 0, and an empty blob
        // gets cached as if it were the whole configuration.
        if (header.data.length < 4) {
            throw new Error(`USB getConfigDescriptor returned a ${header.data.length}-byte header`);
        }

        // wTotalLength is device-supplied. Real configuration descriptors are
        // at most a couple of KiB; a bogus device can claim up to 64 KiB and
        // stall the flasher on one huge read, so treat that as implausible too.
        const totalLength = (header.data[3] << 8) | header.data[2];
        if (totalLength < 9 || totalLength > 4096) {
            throw new Error(`USB getConfigDescriptor reported an implausible length of ${totalLength}`);
        }

        // Now fetch the entire configuration descriptor blob
        const result = await this._withTimeout(
            this._rawControlTransferIn(setup, totalLength),
            5000,
            "getConfigDescriptor",
        );
        if (result.status !== "ok") {
            throw new Error(`USB getConfigDescriptor failed: ${result.status}`);
        }
        if (result.data.length < totalLength) {
            throw new Error(`USB getConfigDescriptor returned ${result.data.length} of ${totalLength} bytes`);
        }

        if ((this._descriptorGeneration ?? 0) === generation) {
            this._configDescriptor = result.data;
        }
        return result.data;
    }

    async getInterfaceDescriptor(interfaceIndex) {
        const buf = await this.getConfigDescriptor();

        // Walk the descriptor chain looking for the Nth interface descriptor (type 4)
        let offset = 9; // skip the 9-byte configuration descriptor header
        let seenInterfaces = 0;

        while (offset + 1 < buf.length) {
            const bLength = buf[offset];
            const bDescriptorType = buf[offset + 1];

            if (bDescriptorType === 4) {
                if (seenInterfaces === interfaceIndex) {
                    return {
                        bLength: buf[offset],
                        bDescriptorType: buf[offset + 1],
                        bInterfaceNumber: buf[offset + 2],
                        bAlternateSetting: buf[offset + 3],
                        bNumEndpoints: buf[offset + 4],
                        bInterfaceClass: buf[offset + 5],
                        bInterfaceSubclass: buf[offset + 6],
                        bInterfaceProtocol: buf[offset + 7],
                        iInterface: buf[offset + 8],
                    };
                }
                seenInterfaces++;
            }

            offset += bLength || 1; // guard against zero-length descriptors
        }

        throw new Error(`USB interface descriptor ${interfaceIndex} not found`);
    }

    /**
     * Count the interface descriptors (type 4) in the configuration blob. Alternate
     * settings each get their own descriptor, so this counts them individually, which
     * is what getInterfaceDescriptor indexes over.
     * @param {Uint8Array} buf
     * @returns {number}
     */
    _countInterfaceDescriptors(buf) {
        let offset = 9;
        let count = 0;
        while (offset + 1 < buf.length) {
            if (buf[offset + 1] === 4) {
                count++;
            }
            offset += buf[offset] || 1;
        }
        return count;
    }

    /**
     * Read all interface descriptor strings for a given interface number.
     * @returns {Promise<string[]>}
     */
    async getInterfaceDescriptors(interfaceNum) {
        const descriptorStringArray = [];
        const descriptorCount = this._countInterfaceDescriptors(await this.getConfigDescriptor());

        for (let i = 0; i < descriptorCount; i++) {
            try {
                const descriptor = await this.getInterfaceDescriptor(i);
                if (descriptor.bInterfaceNumber === interfaceNum) {
                    const str = await this.getString(descriptor.iInterface);
                    descriptorStringArray.push(str);
                }
            } catch (error) {
                console.warn(`${this.logHead} Error reading interface descriptor ${i}:`, error);
                break;
            }
        }

        return descriptorStringArray;
    }

    /**
     * Decode a DFU functional descriptor from `buf` at `offset`.
     * @param {Uint8Array} buf - Buffer containing the descriptor.
     * @param {number} [offset=0] - Byte offset of the descriptor's bLength field.
     * @returns {{bLength:number,bDescriptorType:number,bmAttributes:number,wDetachTimeOut:number,wTransferSize:number,bcdDFUVersion:number}}
     */
    _parseFunctionalDescriptor(buf, offset = 0) {
        return {
            bLength: buf[offset],
            bDescriptorType: buf[offset + 1],
            bmAttributes: buf[offset + 2],
            wDetachTimeOut: (buf[offset + 4] << 8) | buf[offset + 3],
            wTransferSize: (buf[offset + 6] << 8) | buf[offset + 5],
            bcdDFUVersion: (buf[offset + 8] << 8) | buf[offset + 7],
        };
    }

    /**
     * True if `buf` at `offset` holds a complete DFU functional descriptor with a
     * usable, non-zero wTransferSize. Rejects HID descriptors (same 0x21 type) that are
     * shorter or that decode to a zero transfer size.
     * @param {Uint8Array} buf
     * @param {number} offset
     * @returns {boolean}
     */
    _isValidFunctionalDescriptor(buf, offset) {
        const DFU = UsbDfuDescriptors.DFU_FUNCTIONAL_DESCRIPTOR_TYPE;
        if (buf[offset + 1] !== DFU) {
            return false;
        }
        // The fields we read occupy the first 9 bytes. A device may declare a longer
        // descriptor, so require at least that much rather than exactly that much.
        if (buf[offset] < 9 || offset + 9 > buf.length) {
            return false;
        }
        const wTransferSize = (buf[offset + 6] << 8) | buf[offset + 5];
        return wTransferSize > 0;
    }

    /**
     * Read the DFU functional descriptor.
     *
     * The descriptor (bDescriptorType 0x21) is embedded in the configuration descriptor,
     * so we parse it from the blob we already fetched. Some ST ROM bootloaders (confirmed
     * on the STM32C5) never answer a standalone GET_DESCRIPTOR for it and the request
     * hangs indefinitely; reading it from the config descriptor avoids that request and
     * yields the real wTransferSize.
     *
     * Because 0x21 is also the HID descriptor type, a match is only accepted when it sits
     * inside a DFU interface (bInterfaceClass 0xFE / bInterfaceSubClass 0x01) and is a
     * complete 9-byte descriptor with a non-zero wTransferSize.
     * @returns {Promise<{bLength:number,bDescriptorType:number,bmAttributes:number,wDetachTimeOut:number,wTransferSize:number,bcdDFUVersion:number}>}
     */
    async getFunctionalDescriptor() {
        try {
            const buf = await this.getConfigDescriptor();
            let offset = 0;
            let inDfuInterface = false;
            while (offset + 1 < buf.length) {
                const bLength = buf[offset];
                const bDescriptorType = buf[offset + 1];

                if (bDescriptorType === 4 && offset + 9 <= buf.length) {
                    // Interface descriptor: Application-Specific class 0xFE, DFU subclass 0x01.
                    inDfuInterface = buf[offset + 5] === 0xfe && buf[offset + 6] === 0x01;
                } else if (
                    inDfuInterface &&
                    bDescriptorType === UsbDfuDescriptors.DFU_FUNCTIONAL_DESCRIPTOR_TYPE &&
                    this._isValidFunctionalDescriptor(buf, offset)
                ) {
                    const descriptor = this._parseFunctionalDescriptor(buf, offset);
                    console.log(
                        `${this.logHead} DFU functional descriptor from config: wTransferSize=${descriptor.wTransferSize}`,
                    );
                    return descriptor;
                }
                offset += bLength || 1;
            }
            console.warn(`${this.logHead} DFU functional descriptor not in config blob; trying standalone request`);
        } catch (error) {
            console.warn(`${this.logHead} Could not read config descriptor for functional descriptor: ${error}`);
        }

        // Fallback: request it directly (works on classic ST/AT32/GD32 bootloaders).
        const setup = {
            requestType: "standard",
            recipient: "interface",
            request: 6,
            value: 0x2100,
            index: 0,
        };

        const result = await this._withTimeout(this._rawControlTransferIn(setup, 255), 5000, "getFunctionalDescriptor");
        if (result.status === "ok") {
            if (!this._isValidFunctionalDescriptor(result.data, 0)) {
                throw new Error(`${this.logHead} Invalid DFU functional descriptor in standalone response`);
            }
            return this._parseFunctionalDescriptor(result.data, 0);
        }
        throw new Error(`USB getFunctionalDescriptor failed: ${result.status}`);
    }
}

export default UsbDfuDescriptors;
