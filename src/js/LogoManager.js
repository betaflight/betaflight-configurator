'use strict';

var LogoManager = LogoManager || {
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
                var constraint = this.constraints.imageSize;
                if (img.width != constraint.expectedWidth
                    || img.height != constraint.expectedHeight) {
                    GUI.log(i18n.getMessage("osdSetupCustomLogoImageSizeError", {
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
                var canvas = document.createElement('canvas'),
                    ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                for (var y = 0, Y = canvas.height; y < Y; y++) {
                    for (var x = 0, X = canvas.width; x < X; x++) {
                        var rgbPixel = ctx.getImageData(x, y, 1, 1).data.slice(0, 3),
                            colorKey = rgbPixel.join("-");
                        if (!this.constants.MCM_COLORMAP[colorKey]) {
                            GUI.log(i18n.getMessage("osdSetupCustomLogoColorMapError", {
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
        logoWidthPx: "" + this.constraints.imageSize.expectedWidth,
        logoHeightPx: "" + this.constraints.imageSize.expectedHeight,
    });
    // find/cache DOM elements
    Object.keys(this.elements).forEach(key => {
        this.elements["$" + key] = $(this.elements[key]);
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
        var $el = constraint.$el;
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
    return new Promise((resolve, reject) => {
        /**
         * Validate image using defined constraints and display results on the UI.
         * 
         * @param {HTMLImageElement} img
         */
        var validateImage = img => {
            return new Promise((resolve, reject) => {
                this.resetImageInfo();
                for (var key in this.constraints) {
                    if (!this.constraints.hasOwnProperty(key)) {
                        continue;
                    }
                    var constraint = this.constraints[key],
                        satisfied = constraint.test(img);
                    if (satisfied) {
                        this.showConstraintSatisfied(constraint);
                    } else {
                        this.showConstraintNotSatisfied(constraint);
                        reject("Boot logo image constraint violation");
                        return;
                    }
                }
                resolve();
            });
        };
        var dialogOptions = {
            type: 'openFile',
            accepts: this.acceptFileTypes
        };
        chrome.fileSystem.chooseEntry(dialogOptions, fileEntry => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                return;
            }
            // load and validate selected image
            var img = new Image();
            img.onload = () => {
                validateImage(img)
                    .then(() => resolve(img))
                    .catch(error => reject(error));
            };
            img.onerror = error => reject(error);
            fileEntry.file(file => img.src = "file://" + file.path);
        });
    });
};

/**
 * Replaces the logo in the loaded font based on an image.
 * 
 * @param {HTMLImageElement} img
 */
LogoManager.replaceLogoInFont = function (img) {
    /**
     * Takes an ImageData object and returns an MCM symbol as an array of strings.
     * 
     * @param {ImageData} data
     */
    var imageToCharacter = data => {
        var char = [],
            line = "";
        for (var i = 0, I = data.length; i < I; i += 4) {
            var rgbPixel = data.slice(i, i + 3),
                colorKey = rgbPixel.join("-");
            line += this.constants.MCM_COLORMAP[colorKey]
                || this.constants.MCM_COLORMAP['default'];
            if (line.length == 8) {
                char.push(line);
                line = "";
            }
        }
        var fieldSize = this.font.constants.SIZES.MAX_NVM_FONT_CHAR_FIELD_SIZE;
        if (char.length < fieldSize) {
            var pad = this.constants.MCM_COLORMAP['default'].repeat(4);
            for (var i = 0, I = fieldSize - char.length; i < I; i++)
                char.push(pad);
        }
        return char;
    };
    // takes an OSD symbol as an array of strings and replaces the in-memory character at charAddress with it
    var replaceChar = (lines, charAddress) => {
        var characterBits = [];
        var characterBytes = [];
        for (var n = 0, N = lines.length; n < N; n++) {
            var line = lines[n];
            for (var y = 0; y < 8; y = y + 2) {
                var v = parseInt(line.slice(y, y + 2), 2);
                characterBits.push(v);
            }
            characterBytes.push(parseInt(line, 2));
        }
        this.font.data.characters[charAddress] = characterBits;
        this.font.data.characters_bytes[charAddress] = characterBytes;
        this.font.data.character_image_urls[charAddress] = null;
        this.font.draw(charAddress);
    };
    // loop through an image and replace font symbols
    var canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d'),
        charAddr = this.logoStartIndex;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    for (var y = 0; y < this.constants.TILES_NUM_VERT; y++) {
        for (var x = 0; x < this.constants.TILES_NUM_HORIZ; x++) {
            var imageData = ctx.getImageData(
                x * this.font.constants.SIZES.CHAR_WIDTH,
                y * this.font.constants.SIZES.CHAR_HEIGHT,
                this.font.constants.SIZES.CHAR_WIDTH,
                this.font.constants.SIZES.CHAR_HEIGHT
            ),
                newChar = imageToCharacter(imageData.data);
            replaceChar(newChar, charAddr);
            charAddr++;
        }
    }
};

/**
 * Draw the logo using the loaded font data.
 */
LogoManager.drawPreview = function () {
    var $el = this.elements.$preview.empty();
    for (var i = this.logoStartIndex, I = this.font.constants.MAX_CHAR_COUNT; i < I; i++) {
        var url = this.font.data.character_image_urls[i];
        $el.append('<img src="' + url + '" title="0x' + i.toString(16) + '"></img>');
    }
};
