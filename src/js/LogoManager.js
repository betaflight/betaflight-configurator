import { gui_log } from "./gui_log";
import { i18n } from "./localization";
import { checkChromeRuntimeError } from "./utils/common";
import $ from 'jquery';

/**
 * Takes an ImageData object and returns an MCM symbol as an array of strings.
 *
 * @param {ImageData} data
 */
function imageToCharacter(data) {
    const char = [];
    let line = "";
    for (let i = 0, I = data.length; i < I; i += 4) {
        const rgbPixel = data.slice(i, i + 3),
            colorKey = rgbPixel.join("-");
        line += this.constants.MCM_COLORMAP[colorKey]
            || this.constants.MCM_COLORMAP['default'];
        if (line.length === 8) {
            char.push(line);
            line = "";
        }
    }
    const fieldSize = this.font.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE;
    if (char.length < fieldSize) {
        const pad = this.constants.MCM_COLORMAP['default'].repeat(4);
        for (let i = 0, I = fieldSize - char.length; i < I; i++) {
            char.push(pad);
        }
    }
    return char;
}

/**
 * Takes an OSD symbol as an array of strings and replaces the in-memory character at charAddress with it.
 *
 * @param {Array<String>} lines
 * @param {Number} charAddress
 */
function replaceChar(lines, charAddress) {
    const characterBits = [],
        characterBytes = [];
    for (let n = 0, N = lines.length; n < N; n++) {
        const line = lines[n];
        for (let y = 0; y < 8; y = y + 2) {
            characterBits.push(parseInt(line.slice(y, y + 2), 2));
        }
        characterBytes.push(parseInt(line, 2));
    }
    this.font.data.characters[charAddress] = characterBits;
    this.font.data.characters_bytes[charAddress] = characterBytes;
    this.font.data.character_image_urls[charAddress] = null;
    this.font.draw(charAddress);
}

/**
 * Validate image using defined constraints and display results on the UI.
 *
 * @param {HTMLImageElement} img
 */
function validateImage(img) {
    return new Promise((resolveValidateImage, rejectValidateImage) => {
        this.resetImageInfo();
        for (const key in this.constraints) {
            if (!this.constraints.hasOwnProperty(key)) {
                continue;
            }
            const constraint = this.constraints[key],
                satisfied = constraint.test(img);
            if (satisfied) {
                this.showConstraintSatisfied(constraint);
            } else {
                this.showConstraintNotSatisfied(constraint);
                rejectValidateImage("Boot logo image constraint violation");
                return;
            }
        }
        resolveValidateImage();
    });
}

const LogoManager = {
    // dependencies set by init()
    font: null,
    logoStartIndex: null,
    // DOM elements to cache
    elements: {
        preview: "#font-logo-preview",
        uploadHint: "#font-logo-info-upload-hint",
    },
    // predefined values for handling the logo image
    constants: {
        TILES_NUM_HORIZ: 24,
        TILES_NUM_VERT: 4,
        MCM_COLORMAP: {
            // background
            '0-255-0': '01',
            // black
            '0-0-0': '00',
            // white
            '255-255-255': '10',
            // fallback
            'default': '01',
        },
    },
    // config for logo image selection dialog
    acceptFileTypes: [
        { description: 'images', extensions: ['png', 'bmp'] },
    ],
};

/**
 * Initialize Logo Manager UI with dependencies.
 *
 * @param {FONT} font
 * @param {number} logoStartIndex
 */
LogoManager.init = function (font, logoStartIndex) {
    // custom logo image constraints
    this.constraints = {
        // test for image size
        imageSize: {
            el: "#font-logo-info-size",
            // calculate logo image size at runtime as it may change conditionally in the future
            expectedWidth: font.constants.SIZES.CHAR_WIDTH
                * this.constants.TILES_NUM_HORIZ,
            expectedHeight: font.constants.SIZES.CHAR_HEIGHT
                * this.constants.TILES_NUM_VERT,
            /**
             * @param {HTMLImageElement} img
             */
            test: img => {
                const constraint = this.constraints.imageSize;
                if (img.width !== constraint.expectedWidth
                    || img.height !== constraint.expectedHeight) {
                    gui_log(i18n.getMessage("osdSetupCustomLogoImageSizeError", {
                        width: img.width,
                        height: img.height,
                    }));
                    return false;
                }
                return true;
            },
        },
        // test for pixel colors
        colorMap: {
            el: "#font-logo-info-colors",
            /**
             * @param {HTMLImageElement} img
             */
            test: img => {
                const canvas = document.createElement('canvas'),
                    ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                for (let y = 0, Y = canvas.height; y < Y; y++) {
                    for (let x = 0, X = canvas.width; x < X; x++) {
                        const rgbPixel = ctx.getImageData(x, y, 1, 1).data.slice(0, 3),
                            colorKey = rgbPixel.join("-");
                        if (!this.constants.MCM_COLORMAP[colorKey]) {
                            gui_log(i18n.getMessage("osdSetupCustomLogoColorMapError", {
                                valueR: rgbPixel[0],
                                valueG: rgbPixel[1],
                                valueB: rgbPixel[2],
                                posX: x,
                                posY: y,
                            }));
                            return false;
                        }
                    }
                }
                return true;
            },
        },
    };

    // deps from osd.js
    this.font = font;
    this.logoStartIndex = logoStartIndex;
    // inject logo size variables for dynamic translation strings
    i18n.addResources({
        logoWidthPx: `${this.constraints.imageSize.expectedWidth}`, // NOSONAR
        logoHeightPx: `${this.constraints.imageSize.expectedHeight}`, // NOSONAR
    });
    // find/cache DOM elements
    Object.keys(this.elements).forEach(key => {
        this.elements[`$${key}`] = $(this.elements[key]);
    });
    Object.keys(this.constraints).forEach(key => {
        this.constraints[key].$el = $(this.constraints[key].el);
    });
    // resize logo preview area to match tile size
    this.elements.$preview
        .width(this.constraints.imageSize.expectedWidth)
        .height(this.constraints.imageSize.expectedHeight);
    this.resetImageInfo();
};

LogoManager.resetImageInfo = function () {
    this.hideUploadHint();
    Object.values(this.constraints).forEach(constraint => {
        const $el = constraint.$el;
        $el.toggleClass("invalid", false);
        $el.toggleClass("valid", false);
    });
};

LogoManager.showConstraintNotSatisfied = constraint => {
    constraint.$el.toggleClass("invalid", true);
};

LogoManager.showConstraintSatisfied = constraint => {
    constraint.$el.toggleClass("valid", true);
};

LogoManager.showUploadHint = function () {
    this.elements.$uploadHint.show();
};

LogoManager.hideUploadHint = function () {
    this.elements.$uploadHint.hide();
};

/**
 * Show a file open dialog and resolve to an Image object.
 *
 * @returns {Promise}
 */
LogoManager.openImage = function () {
    return new Promise((resolveOpenImage, rejectOpenImage) => {
        const dialogOptions = {
            type: 'openFile',
            accepts: this.acceptFileTypes,
        };
        chrome.fileSystem.chooseEntry(dialogOptions, fileEntry => {
            if (checkChromeRuntimeError()) {
                return;
            }
            // load and validate selected image
            const img = new Image();
            img.onload = () => {
                validateImage.apply(this, [img])
                    .then(() => resolveOpenImage(img))
                    .catch(error => rejectOpenImage(error));
            };
            img.onerror = error => rejectOpenImage(error);
            fileEntry.file(file => img.src = `file://${file.path}`);
        });
    });
};

/**
 * Replaces the logo in the loaded font based on an image.
 *
 * @param {HTMLImageElement} img
 */
LogoManager.replaceLogoInFont = function (img) {
    // loop through an image and replace font symbols
    const canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d');
    let charAddr = this.logoStartIndex;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    for (let y = 0; y < this.constants.TILES_NUM_VERT; y++) {
        for (let x = 0; x < this.constants.TILES_NUM_HORIZ; x++) {
            const imageData = ctx.getImageData(
                x * this.font.constants.SIZES.CHAR_WIDTH,
                y * this.font.constants.SIZES.CHAR_HEIGHT,
                this.font.constants.SIZES.CHAR_WIDTH,
                this.font.constants.SIZES.CHAR_HEIGHT,
            ),
                newChar = imageToCharacter.apply(this, [imageData.data]);
            replaceChar.apply(this, [newChar, charAddr]);
            charAddr++;
        }
    }
};

/**
 * Draw the logo using the loaded font data.
 */
LogoManager.drawPreview = function () {
    const $el = this.elements.$preview.empty();
    for (let i = this.logoStartIndex, I = this.font.constants.MAX_CHAR_COUNT; i < I; i++) {
        const url = this.font.data.character_image_urls[i];
        $el.append(`<img src="${url}" title="0x${i.toString(16)}"></img>`);
    }
};

export default LogoManager;
