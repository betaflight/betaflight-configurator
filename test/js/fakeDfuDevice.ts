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

/** DFU states the fake bootloaders move through. */
export const DFU_STATE = { dfuIDLE: 2, dfuDNBUSY: 4, dfuDNLOAD_IDLE: 5, dfuUPLOAD_IDLE: 9, dfuERROR: 10 };

/** DFU class requests the flasher issues. */
export const DFU_REQUEST = { DNLOAD: 1, UPLOAD: 2, GETSTATUS: 3, CLRSTATUS: 4, ABORT: 6 };

const succeed = (): Promise<void> => Promise.resolve();

/**
 * The device-lifecycle half of a DFU transport, shared by the fake ROM bootloaders:
 * one device that opens, claims and closes without fuss and reports fixed memory-layout
 * strings. Subclasses emulate the control transfers.
 */
export class FakeDfuDevice extends EventTarget {
    /**
     * @param path - Device path reported to the flasher.
     * @param descriptorStrings - Memory-layout descriptor strings the bootloader reports.
     * @param transferSize - wTransferSize of the DFU functional descriptor.
     */
    constructor(
        private readonly path: string,
        private readonly descriptorStrings: string[],
        private readonly transferSize = 2048,
    ) {
        super();
    }

    getDevices() {
        return Promise.resolve([{ path: this.path, displayName: this.path, port: {} }]);
    }
    getConnectedDevice() {
        return this.path;
    }
    // Opening, claiming and closing always succeed.
    open = succeed;
    claimInterface = succeed;
    releaseInterface = succeed;
    close = succeed;
    reset = succeed;

    getInterfaceDescriptors() {
        return Promise.resolve(this.descriptorStrings);
    }
    getFunctionalDescriptor() {
        return Promise.resolve({ wTransferSize: this.transferSize, bcdDFUVersion: 0x011a });
    }
}
