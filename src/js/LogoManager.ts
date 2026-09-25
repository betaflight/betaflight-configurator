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

import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import FileSystem from "./FileSystem";
import type { FONT } from "./utils/osdFont";

type Font = typeof FONT;

interface LogoConstraint {
    /** selector of the element that shows whether the constraint holds */
    el: string;
    _el?: Element | null;
    test(img: HTMLImageElement): boolean;
}

interface LogoConstraints {
    imageSize: LogoConstraint & { expectedWidth: number; expectedHeight: number };
    colorMap: LogoConstraint;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("2D canvas context unavailable");
    }
    return ctx;
}

/** The font init() was given; everything but init() runs after it. */
function initializedFont(): Font {
    if (!LogoManager.font) {
        throw new Error("LogoManager.init() has not been called");
    }
    return LogoManager.font;
}

/**
 * Takes an ImageData object's pixels and returns an MCM symbol as an array of strings.
 */
function imageToCharacter(data: Uint8ClampedArray): string[] {
    const colormap: Record<string, string | undefined> = LogoManager.constants.MCM_COLORMAP;
    const char: string[] = [];
    let line = "";
    for (let i = 0, I = data.length; i < I; i += 4) {
        const rgbPixel = data.slice(i, i + 3),
            colorKey = rgbPixel.join("-");
        line += colormap[colorKey] || LogoManager.constants.MCM_COLORMAP["default"];
        if (line.length === 8) {
            char.push(line);
            line = "";
        }
    }
    const fieldSize = initializedFont().constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE;
    if (char.length < fieldSize) {
        const pad = LogoManager.constants.MCM_COLORMAP["default"].repeat(4);
        for (let i = 0, I = fieldSize - char.length; i < I; i++) {
            char.push(pad);
        }
    }
    return char;
}

/**
 * Takes an OSD symbol as an array of strings and replaces the in-memory character at charAddress with it.
 */
function replaceChar(lines: string[], charAddress: number): void {
    const characterBits: number[] = [],
        characterBytes: number[] = [];
    for (let n = 0, N = lines.length; n < N; n++) {
        const line = lines[n];
        for (let y = 0; y < 8; y = y + 2) {
            characterBits.push(Number.parseInt(line.slice(y, y + 2), 2));
        }
        characterBytes.push(Number.parseInt(line, 2));
    }
    const font = initializedFont();
    const data = font.data;
    if (!data) {
        throw new Error("FONT.initData() has not been called");
    }
    data.characters[charAddress] = characterBits;
    data.characters_bytes[charAddress] = characterBytes;
    // Clear the cached image so draw() renders the new character.
    data.character_image_urls[charAddress] = "";
    font.draw(charAddress);
}

/**
 * Validate image using defined constraints and display results on the UI.
 */
function validateImage(img: HTMLImageElement): Promise<void> {
    return new Promise((resolveValidateImage, rejectValidateImage) => {
        LogoManager.resetImageInfo();
        for (const constraint of Object.values(LogoManager.constraints ?? {})) {
            const satisfied = constraint.test(img);
            if (satisfied) {
                LogoManager.showConstraintSatisfied(constraint);
            } else {
                LogoManager.showConstraintNotSatisfied(constraint);
                rejectValidateImage("Boot logo image constraint violation");
                return;
            }
        }
        resolveValidateImage();
    });
}

const LogoManager = {
    // dependencies set by init()
    font: null as Font | null,
    logoStartIndex: null as number | null | undefined,
    constraints: undefined as LogoConstraints | undefined,
    // DOM elements to cache
    elements: {
        preview: "#font-logo-preview",
        uploadHint: "#font-logo-info-upload-hint",
        _preview: undefined as HTMLElement | null | undefined,
        _uploadHint: undefined as HTMLElement | null | undefined,
    },
    // predefined values for handling the logo image
    constants: {
        TILES_NUM_HORIZ: 24,
        TILES_NUM_VERT: 4,
        MCM_COLORMAP: {
            // background
            "0-255-0": "01",
            // black
            "0-0-0": "00",
            // white
            "255-255-255": "10",
            // fallback
            default: "01",
        },
    },
    // config for logo image selection dialog
    acceptFileTypes: [{ description: "images", extensions: ["png", "bmp"] }],

    /**
     * Initialize Logo Manager UI with dependencies.
     */
    init(font: Font, logoStartIndex: number | undefined): void {
        const colormap: Record<string, string | undefined> = this.constants.MCM_COLORMAP;
        // custom logo image constraints
        const constraints: LogoConstraints = {
            // test for image size
            imageSize: {
                el: "#font-logo-info-size",
                // calculate logo image size at runtime as it may change conditionally in the future
                expectedWidth: font.constants.SIZES.CHAR_WIDTH * this.constants.TILES_NUM_HORIZ,
                expectedHeight: font.constants.SIZES.CHAR_HEIGHT * this.constants.TILES_NUM_VERT,
                test: (img) => {
                    const constraint = constraints.imageSize;
                    if (img.width !== constraint.expectedWidth || img.height !== constraint.expectedHeight) {
                        gui_log(
                            i18n.getMessage("osdSetupCustomLogoImageSizeError", {
                                width: img.width,
                                height: img.height,
                                logoWidthPx: constraint.expectedWidth,
                                logoHeightPx: constraint.expectedHeight,
                            }),
                        );
                        return false;
                    }
                    return true;
                },
            },
            // test for pixel colors
            colorMap: {
                el: "#font-logo-info-colors",
                test: (img) => {
                    const canvas = document.createElement("canvas"),
                        ctx = context2d(canvas);
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    for (let y = 0, Y = canvas.height; y < Y; y++) {
                        for (let x = 0, X = canvas.width; x < X; x++) {
                            const rgbPixel = ctx.getImageData(x, y, 1, 1).data.slice(0, 3),
                                colorKey = rgbPixel.join("-");
                            if (!colormap[colorKey]) {
                                gui_log(
                                    i18n.getMessage("osdSetupCustomLogoColorMapError", {
                                        valueR: rgbPixel[0],
                                        valueG: rgbPixel[1],
                                        valueB: rgbPixel[2],
                                        posX: x,
                                        posY: y,
                                    }),
                                );
                                return false;
                            }
                        }
                    }
                    return true;
                },
            },
        };
        this.constraints = constraints;

        // deps from osd.js
        this.font = font;
        this.logoStartIndex = logoStartIndex;
        // find/cache DOM elements
        this.elements._preview = document.querySelector<HTMLElement>(this.elements.preview);
        this.elements._uploadHint = document.querySelector<HTMLElement>(this.elements.uploadHint);
        for (const constraint of Object.values(constraints)) {
            constraint._el = document.querySelector(constraint.el);
        }
        // resize logo preview area to match tile size
        const preview = this.elements._preview;
        if (preview) {
            preview.style.width = `${constraints.imageSize.expectedWidth}px`;
            preview.style.height = `${constraints.imageSize.expectedHeight}px`;
        }
        this.resetImageInfo();
    },

    resetImageInfo(): void {
        this.hideUploadHint();
        Object.values(this.constraints ?? {}).forEach((constraint) => {
            const el = constraint._el;
            if (el) {
                el.classList.remove("invalid", "valid");
            }
        });
    },

    showConstraintNotSatisfied(constraint: LogoConstraint): void {
        constraint._el?.classList.add("invalid");
    },

    showConstraintSatisfied(constraint: LogoConstraint): void {
        constraint._el?.classList.add("valid");
    },

    showUploadHint(): void {
        if (this.elements._uploadHint) {
            this.elements._uploadHint.style.display = "";
        }
    },

    hideUploadHint(): void {
        if (this.elements._uploadHint) {
            this.elements._uploadHint.style.display = "none";
        }
    },

    /**
     * Show a file open dialog and resolve to an Image object.
     */
    openImage(): Promise<HTMLImageElement> {
        return new Promise((resolveOpenImage, rejectOpenImage) => {
            FileSystem.pickOpenFile(
                i18n.getMessage("fileSystemPickerFiles", {
                    typeof: this.acceptFileTypes[0].description.toUpperCase(),
                }),
                this.acceptFileTypes[0].extensions.map((ext) => {
                    return `.${ext}`;
                }),
                "logo-file",
            )
                .then((file) => {
                    // A cancelled picker yields no file; the promise stays pending, as it did
                    // when readFileAsBlob rejected on it unobserved.
                    if (!file) {
                        return;
                    }
                    FileSystem.readFileAsBlob(file).then((data: Blob) => {
                        // load and validate selected image
                        const img = new Image();
                        img.onload = () => {
                            validateImage(img)
                                .then(() => resolveOpenImage(img))
                                .catch((error) => rejectOpenImage(error));
                        };
                        img.onerror = (error) => rejectOpenImage(error);

                        const blobUrl = URL.createObjectURL(data);
                        img.src = blobUrl;
                    });
                })
                .catch((error) => {
                    console.error("could not load logo file:", error);
                });
        });
    },

    /**
     * Replaces the logo in the loaded font based on an image.
     */
    replaceLogoInFont(img: HTMLImageElement): void {
        const font = initializedFont();
        if (this.logoStartIndex === null || this.logoStartIndex === undefined) {
            return;
        }
        // loop through an image and replace font symbols
        const canvas = document.createElement("canvas"),
            ctx = context2d(canvas);
        let charAddr = this.logoStartIndex;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        for (let y = 0; y < this.constants.TILES_NUM_VERT; y++) {
            for (let x = 0; x < this.constants.TILES_NUM_HORIZ; x++) {
                const imageData = ctx.getImageData(
                        x * font.constants.SIZES.CHAR_WIDTH,
                        y * font.constants.SIZES.CHAR_HEIGHT,
                        font.constants.SIZES.CHAR_WIDTH,
                        font.constants.SIZES.CHAR_HEIGHT,
                    ),
                    newChar = imageToCharacter(imageData.data);
                replaceChar(newChar, charAddr);
                charAddr++;
            }
        }
    },

    /**
     * Draw the logo using the loaded font data.
     */
    drawPreview(): void {
        const el = this.elements._preview;
        if (!el) {
            return;
        }
        el.innerHTML = "";
        const font = initializedFont();
        if (this.logoStartIndex === null || this.logoStartIndex === undefined) {
            return;
        }
        for (let i = this.logoStartIndex, I = font.constants.MAX_CHAR_COUNT; i < I; i++) {
            const url = font.data?.character_image_urls[i] ?? "";
            const img = document.createElement("img");
            img.src = url;
            img.title = `0x${i.toString(16)}`;
            el.appendChild(img);
        }
    },
};

export default LogoManager;
