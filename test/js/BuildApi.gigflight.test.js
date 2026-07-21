import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BuildApi from "../../src/js/BuildApi";

function githubContent(text) {
    return {
        content: Buffer.from(text, "utf8").toString("base64"),
    };
}

function jsonResponse(body) {
    return {
        status: 200,
        json: vi.fn().mockResolvedValue(body),
    };
}

function bytesResponse(bytes) {
    return {
        status: 200,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from(bytes).buffer),
    };
}

describe("BuildApi GIGFLIGHT catalogue integration", () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn(async (url, options = {}) => {
            const requestUrl = String(url);

            if (requestUrl.endsWith("/repos/timmyfpv/gigflight-config/contents/configs")) {
                return jsonResponse([
                    {
                        name: "GIGRACE",
                        path: "configs/GIGRACE",
                        type: "dir",
                    },
                ]);
            }

            if (requestUrl.endsWith("/repos/timmyfpv/gigflight-config/contents/README.md")) {
                return jsonResponse(
                    githubContent(`
| Target | Board | MCU | Manufacturer ID |
| - | - | - | - |
| \`GIGRACE\` | GIGFPV GIGRACE | \`STM32H743VIH6\` | \`GIGF\` |
`),
                );
            }

            if (requestUrl.endsWith("/repos/timmyfpv/gigflight-config/contents/configs/GIGRACE/config.h")) {
                return jsonResponse(
                    githubContent(`
#define FC_TARGET_MCU     STM32H743
#define BOARD_NAME        GIGRACE
#define MANUFACTURER_ID   GIGF
`),
                );
            }

            if (requestUrl.endsWith("/repos/timmyfpv/GIGFLIGHT/releases")) {
                return jsonResponse([
                    {
                        tag_name: "26.0",
                        draft: false,
                        prerelease: false,
                    },
                ]);
            }

            if (requestUrl.endsWith("/repos/timmyfpv/GIGFLIGHT/releases/tags/26.0")) {
                return jsonResponse({
                    tag_name: "26.0",
                    html_url: "https://github.com/timmyfpv/GIGFLIGHT/releases/tag/26.0",
                    published_at: "2026-07-20T21:55:31Z",
                    prerelease: false,
                    assets: [
                        {
                            name: "gigflight_2025.12.5_STM32H743_GIGRACE.hex",
                            url: "https://api.github.com/repos/timmyfpv/GIGFLIGHT/releases/assets/483946394",
                        },
                    ],
                });
            }

            if (requestUrl.endsWith("/repos/timmyfpv/GIGFLIGHT/releases/assets/483946394")) {
                expect(options.headers.Accept).toBe("application/octet-stream");
                return bytesResponse([0x3a, 0x10, 0x20]);
            }

            throw new Error(`Unexpected fetch: ${requestUrl}`);
        });

        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("loads targets from gigflight-config and release assets from GIGFLIGHT", async () => {
        const api = new BuildApi(null);

        await expect(api.loadTargets()).resolves.toEqual([
            expect.objectContaining({
                target: "GIGRACE",
                board: "GIGFPV GIGRACE",
                mcu: "STM32H743VIH6",
                manufacturer: "GIGFPV",
                repository: "timmyfpv/GIGFLIGHT",
                configRepository: "timmyfpv/gigflight-config",
            }),
        ]);

        await expect(api.loadTargetReleases("GIGRACE")).resolves.toEqual({
            releases: [
                {
                    release: "26.0",
                    label: "GIGFLIGHT",
                    type: "Stable",
                },
            ],
        });

        const targetDetail = await api.loadTarget("GIGRACE", "26.0");
        expect(targetDetail).toEqual(
            expect.objectContaining({
                target: "GIGRACE",
                release: "26.0",
                file: "https://api.github.com/repos/timmyfpv/GIGFLIGHT/releases/assets/483946394",
                filename: "gigflight_2025.12.5_STM32H743_GIGRACE.hex",
                firmwareType: "HEX",
                cloudBuild: false,
            }),
        );

        await expect(api.loadTargetFirmware(targetDetail.file)).resolves.toEqual(Uint8Array.from([0x3a, 0x10, 0x20]));
    });
});
