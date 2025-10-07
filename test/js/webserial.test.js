import { test, expect, vi } from "vitest";

// Mock GUI to avoid importing modules (like msp -> serial) that instantiate protocols
vi.mock("../../src/js/gui.js", () => {
    return {
        default: {
            operating_system: "Linux",
        },
    };
});

import WebSerial from "../../src/js/protocols/WebSerial.js";

test("WebSerial.connect recovers successfully when already-open port provides reader/writer", async () => {
    // Ensure a minimal navigator.serial mock exists for the constructor
    globalThis.navigator = globalThis.navigator || {};
    globalThis.navigator.serial = {
        getPorts: async () => [],
        requestPort: async () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    };

    const ws = new WebSerial();

    // Create fake reader/writer that look like already-acquired locks
    let readerLocked = true;
    // Make the reader yield one chunk, then signal done so readLoop emits a receive event
    let readCalled = 0;
    const fakeReader = {
        locked: true,
        read: async () => {
            readCalled += 1;
            if (readCalled === 1) {
                return { done: false, value: new Uint8Array([1, 2, 3]) };
            }
            return { done: true };
        },
        releaseLock: () => {
            readerLocked = false;
            fakeReader.locked = false;
        },
        cancel: async () => {},
    };

    const fakeWriter = {
        write: async () => {},
        releaseLock: () => {},
    };

    // Fake port that throws InvalidStateError from open(), but exposes reader/writer
    const fakePort = {
        getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0xabcd }),
        open: async () => {
            const e = new Error("already open");
            e.name = "InvalidStateError";
            throw e;
        },
        writable: { getWriter: () => fakeWriter },
        readable: { getReader: () => fakeReader },
        addEventListener: () => {},
        removeEventListener: () => {},
        close: async () => {},
    };

    // Register the fake port under the expected shape
    ws.ports = [
        {
            path: "serial",
            displayName: "Fake Serial",
            vendorId: 0x1234,
            productId: 0xabcd,
            port: fakePort,
        },
    ];

    const connectEvents = [];
    ws.addEventListener("connect", (e) => connectEvents.push(e.detail));

    const receiveEvents = [];
    ws.addEventListener("receive", (e) => receiveEvents.push(e.detail));

    const result = await ws.connect("serial", { baudRate: 115200 });

    // Expect the recovery to succeed and return true
    expect(result).toBe(true);
    // openRequested should be cleared after success
    expect(ws.openRequested).toBe(false);
    // Should be marked connected
    expect(ws.connected).toBe(true);
    // Writer and reader should be assigned
    expect(ws.writer).toBeTruthy();
    expect(ws.reader).toBeTruthy();
    // A connect event with connectionInfo should have been dispatched
    expect(connectEvents.length).toBeGreaterThanOrEqual(1);
    expect(connectEvents[0]).toMatchObject({ usbVendorId: 0x1234, usbProductId: 0xabcd });
    // Wait a short time for the async read loop to run and emit the receive event
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The read loop should have produced one receive event from the fake reader
    expect(receiveEvents.length).toBeGreaterThanOrEqual(1);
    // The first receive event should be a Uint8Array matching what the fake reader returned
    expect(receiveEvents[0]).toBeInstanceOf(Uint8Array);
    expect(receiveEvents[0].length).toBe(3);
});

test("WebSerial.connect gracefully fails when recovery lacks reader/writer", async () => {
    // Ensure a minimal navigator.serial mock exists for the constructor
    globalThis.navigator = globalThis.navigator || {};
    globalThis.navigator.serial = {
        getPorts: async () => [],
        requestPort: async () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    };

    const ws = new WebSerial();

    // Fake port that throws InvalidStateError from open()
    const fakePort = {
        getInfo: () => ({ usbVendorId: 0x1234, usbProductId: 0xabcd }),
        open: async () => {
            const e = new Error("already open");
            e.name = "InvalidStateError";
            throw e;
        },
        // Provide readable/writable objects whose getters return undefined
        writable: { getWriter: () => undefined },
        readable: { getReader: () => undefined },
        addEventListener: () => {},
        removeEventListener: () => {},
        close: async () => {},
    };

    // Register the fake port under the expected shape
    ws.ports = [
        {
            path: "serial",
            displayName: "Fake Serial",
            vendorId: 0x1234,
            productId: 0xabcd,
            port: fakePort,
        },
    ];

    const connectEvents = [];
    ws.addEventListener("connect", (e) => connectEvents.push(e.detail));

    const result = await ws.connect("serial", { baudRate: 115200 });

    // Expect the recovery to fail gracefully and return false
    expect(result).toBe(false);
    // openRequested should be cleared on failure
    expect(ws.openRequested).toBe(false);
    // A connect event with detail false should have been dispatched
    expect(connectEvents.length).toBeGreaterThanOrEqual(1);
    expect(connectEvents).toContain(false);
});
