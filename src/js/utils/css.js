'use strict';

/*
  This utility contains CSS helpers.
*/

const CSSUtil = function () {};

CSSUtil.prototype.colorTables = {
  redWhiteGreen: [
    { percentage: -1, color: { r: 0xff, g: 0x00, b: 0x00, a: 1.0 } },
    { percentage: 0, color: { r: 0xff, g: 0xff, b: 0xff, a: 1.0 } },
    { percentage: 1, color: { r: 0x00, g: 0xff, b: 0x00, a: 1.0 } },
  ],
  pidSlider: [
    { percentage: -1, color: { r: 0xc5, g: 0xc5, b: 0xc5, a: 1.0 } },
    { percentage: 0, color: { r: 0xff, g: 0xff, b: 0xff, a: 0.0 } },
    { percentage: 1, color: { r: 0xff, g: 0x54, b: 0x0e, a: 1.0 } },
  ],
};

// Stack Overflow: https://stackoverflow.com/a/7128796/4107016
CSSUtil.prototype.getColorForPercentage = function(percentage, colorTable = null) {
    colorTable = colorTable || cssUtil.colorTables.redWhiteGreen;

    percentage = Math.min(1, Math.max(-1, percentage));

    let index;
    for (index = 1; index < colorTable.length - 1; index++) {
        if (percentage < colorTable[index].percentage) {
            break;
        }
    }
    const lower = colorTable[index - 1];
    const upper = colorTable[index];
    const range = upper.percentage - lower.percentage;
    const rangePercentage = (percentage - lower.percentage) / range;
    const percentageLower = 1 - rangePercentage;
    const percentageUpper = rangePercentage;
    const color = {
        r: Math.floor(lower.color.r * percentageLower + upper.color.r * percentageUpper),
        g: Math.floor(lower.color.g * percentageLower + upper.color.g * percentageUpper),
        b: Math.floor(lower.color.b * percentageLower + upper.color.b * percentageUpper),
        a: lower.color.a * percentageLower + upper.color.a * percentageUpper,
    };
    return `rgba(${  [color.r, color.g, color.b, color.a].join(",")  })`;
};

const cssUtil = new CSSUtil();
window.cssUtil = cssUtil;
export default cssUtil;
