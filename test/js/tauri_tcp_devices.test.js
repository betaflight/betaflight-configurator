import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, listen: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const { default: TauriTcp } = await import("../../src/js/protocols/TauriTcp.js");

const bridge = {
    name: "betaflight-bridge-f8a260",
    host: "betaflight-bridge-f8a260.local",
    addresses: ["10.1.1.208"],
    port: 5761,
    board: "esp32s3-wroom-freenove",
    version: "2026.6.0-alpha",
    ws: 80,
    wss: 443,
};

describe("TauriTcp.getDevices — bridges found over mDNS", () => {
    let tcp;

    afterEach(() => {
        tcp?.stopDeviceMonitoring();
        invoke.mockReset();
    });

    it("lists each bridge as a tcp:// port named after the bridge", async () => {
        invoke.mockResolvedValue([bridge]);
        tcp = new TauriTcp();

        const devices = await tcp.getDevices();

        expect(invoke).toHaveBeenCalledWith("mdns_browse");
        expect(devices).toEqual([
            {
                path: "tcp://10.1.1.208:5761",
                displayName: "betaflight-bridge-f8a260",
                vendorId: 0,
                productId: 0,
                port: 0,
            },
        ]);
    });

    it("brackets an IPv6-only bridge and skips one with no address yet", async () => {
        invoke.mockResolvedValue([
            { ...bridge, name: "v6", addresses: ["fe80::1"] },
            { ...bridge, name: "pending", addresses: [] },
        ]);
        tcp = new TauriTcp();

        const devices = await tcp.getDevices();

        expect(devices.map((d) => [d.path, d.displayName])).toEqual([["tcp://[fe80::1]:5761", "v6"]]);
    });

    it("keeps the last list when the browse fails", async () => {
        invoke.mockResolvedValueOnce([bridge]);
        tcp = new TauriTcp();
        await tcp.getDevices();
        invoke.mockRejectedValueOnce(new Error("no multicast"));

        const devices = await tcp.getDevices();

        expect(devices).toHaveLength(1);
    });

    it("emits addedDevice and removedDevice as bridges come and go", async () => {
        invoke.mockResolvedValueOnce([bridge]);
        tcp = new TauriTcp();
        const added = vi.fn();
        const removed = vi.fn();
        tcp.addEventListener("addedDevice", added);
        tcp.addEventListener("removedDevice", removed);

        await tcp.checkDeviceChanges();
        invoke.mockResolvedValueOnce([]);
        await tcp.checkDeviceChanges();

        expect(added).toHaveBeenCalledTimes(1);
        expect(added.mock.calls[0][0].detail.path).toBe("tcp://10.1.1.208:5761");
        expect(removed).toHaveBeenCalledTimes(1);
        expect(removed.mock.calls[0][0].detail.path).toBe("tcp://10.1.1.208:5761");
    });
});
