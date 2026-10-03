import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const connection = vi.hoisted(() => ({ online: true }));

vi.mock("../../src/js/utils/connection", () => ({
    ispConnected: () => connection.online,
}));

vi.mock("../../src/js/localization", () => ({
    i18n: { getMessage: (key: string) => key },
}));

import { get as getConfig, set as setConfig } from "../../src/js/ConfigStorage";
import { IP_GEOLOCATION_CONSENT_KEY, ipCoordinates } from "../../src/js/utils/ipGeolocation";

const okResponse = (body: unknown) => ({ ok: true, json: async () => body });

describe("ipCoordinates", () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let confirmMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        localStorage.clear();
        connection.online = true;
        fetchMock = vi.fn().mockResolvedValue(okResponse({ latitude: "-27.47", longitude: "153.02" }));
        confirmMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("confirm", confirmMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const storedConsent = () => getConfig(IP_GEOLOCATION_CONSENT_KEY)[IP_GEOLOCATION_CONSENT_KEY];
    const grantConsent = () => setConfig({ [IP_GEOLOCATION_CONSENT_KEY]: true });

    it("sends nothing without consent when not allowed to ask", async () => {
        expect(await ipCoordinates(false)).toBeNull();
        expect(confirmMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends nothing when the user declines", async () => {
        confirmMock.mockReturnValue(false);

        expect(await ipCoordinates(true)).toBeNull();
        expect(confirmMock).toHaveBeenCalledWith("preflightIpConsentMessage");
        expect(fetchMock).not.toHaveBeenCalled();
        expect(storedConsent()).toBeFalsy();
    });

    it("remembers a yes and returns the coordinates", async () => {
        confirmMock.mockReturnValue(true);

        expect(await ipCoordinates(true)).toEqual({ lat: -27.47, lon: 153.02 });
        expect(fetchMock).toHaveBeenCalledWith("https://ipapi.co/json/", expect.anything());
        expect(storedConsent()).toBe(true);
    });

    it("uses stored consent without asking again", async () => {
        grantConsent();

        expect(await ipCoordinates(false)).toEqual({ lat: -27.47, lon: 153.02 });
        expect(confirmMock).not.toHaveBeenCalled();
    });

    it("stays offline when internet access is disabled or metered", async () => {
        grantConsent();
        connection.online = false;

        expect(await ipCoordinates(true)).toBeNull();
        expect(confirmMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns null for a failed or malformed response", async () => {
        grantConsent();

        fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
        expect(await ipCoordinates(false)).toBeNull();

        fetchMock.mockResolvedValueOnce(okResponse({ latitude: "n/a" }));
        expect(await ipCoordinates(false)).toBeNull();

        fetchMock.mockRejectedValueOnce(new Error("network"));
        expect(await ipCoordinates(false)).toBeNull();
    });
});
