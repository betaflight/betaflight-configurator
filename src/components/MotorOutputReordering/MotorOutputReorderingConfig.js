'use strict';

class MotorOutputReorderConfig
{
    constructor (screenSize)
    {
        this.FrameColor = 'rgb(186, 186, 186)';
        this.PropEdgeColor = 'rgb(255, 187, 0)';
        this.PropColor = 'rgb(186, 186, 186, 0.4)';
        this.PropEdgeLineWidth = 3;
        this.MotorNumberTextFont = `${screenSize * 0.1}px 'Open Sans', 'Segoe UI', Tahoma, sans-serif`;
        this.MotorNumberTextColor = 'rgb(0, 0, 0)';
        this.MotorMouseHoverColor = 'rgba(255, 187, 0, 0.4)';
        this.MotorSpinningColor = 'rgba(255, 0, 0, 0.4)';
        this.MotorReadyColor = 'rgba(0,128,0,0.4)';

        this.ArrowColor = 'rgb(182,67,67)';
        this.DirectionArrowPoints = [
            {x: -0.03 * screenSize, y:  0.11 * screenSize},
            {x: -0.03 * screenSize, y: -0.01 * screenSize},
            {x: -0.07 * screenSize, y: -0.01 * screenSize},
            {x:  0.0  * screenSize, y: -0.13 * screenSize},
            {x:  0.07 * screenSize, y: -0.01 * screenSize},
            {x:  0.03 * screenSize, y: -0.01 * screenSize},
            {x:  0.03 * screenSize, y:  0.11 * screenSize},
        ];

        //===========================================
        let frameRadius = 0.28 * screenSize;
        this["Quad X"] =
        {
            PropRadius: 0.2 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x:  frameRadius,  y:  frameRadius},
                {x:  frameRadius,  y: -frameRadius},
                {x: -frameRadius,  y:  frameRadius},
                {x: -frameRadius,  y: -frameRadius},
            ],
        };

        //===========================================
        frameRadius = 0.28 * screenSize;
        this["Quad X 1234"] =
        {
            PropRadius: 0.2 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x: -frameRadius,  y: -frameRadius},
                {x:  frameRadius,  y: -frameRadius},
                {x:  frameRadius,  y:  frameRadius},
                {x: -frameRadius,  y:  frameRadius},
            ],
        };

        //===========================================
        frameRadius = 0.32 * screenSize;
        this["Quad +"] =
        {
            PropRadius: 0.15 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x:            0,  y:  frameRadius},
                {x:  frameRadius,  y:  0          },
                {x: -frameRadius,  y:  0          },
                {x:            0,  y: -frameRadius},
            ],
        };

        //===========================================
        frameRadius = 0.30 * screenSize;
        this["Tricopter"] =
        {
            PropRadius: 0.15 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x:            0,  y:  frameRadius},
                {x:  frameRadius,  y: -frameRadius},
                {x: -frameRadius,  y: -frameRadius},
            ],
        };

        //===========================================
        frameRadius = 0.35 * screenSize;
        this["Hex +"] =
        {
            PropRadius: 0.14 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors: [],
        };
        let dAngle = Math.PI / 3;
        let angle = 0;

        angle = dAngle * 1;
        this["Hex +"].Motors.push({x: Math.sin(angle) * frameRadius, y: Math.cos(angle) * frameRadius});

        angle = dAngle * 2;
        this["Hex +"].Motors.push({x: Math.sin(angle) * frameRadius, y: Math.cos(angle) * frameRadius});

        angle = -dAngle * 1;
        this["Hex +"].Motors.push({x: Math.sin(angle) * frameRadius, y: Math.cos(angle) * frameRadius});

        angle = -dAngle * 2;
        this["Hex +"].Motors.push({x: Math.sin(angle) * frameRadius, y: Math.cos(angle) * frameRadius});

        angle = dAngle * 3;
        this["Hex +"].Motors.push({x: Math.sin(angle) * frameRadius, y: Math.cos(angle) * frameRadius});

        angle = dAngle * 0;
        this["Hex +"].Motors.push({x: Math.sin(angle) * frameRadius, y: Math.cos(angle) * frameRadius});

        //===========================================
        frameRadius = 0.35 * screenSize;
        this["Hex X"] =
        {
            PropRadius: 0.14 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors: [],
        };
        dAngle = Math.PI / 3;

        angle = dAngle * 1;
        this["Hex X"].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = -dAngle * 1;
        this["Hex X"].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 2;
        this["Hex X"].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = -dAngle * 2;
        this["Hex X"].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 0;
        this["Hex X"].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 3;
        this["Hex X"].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        //===========================================
        this._addOcto("Octo Flat +", -Math.PI / 2.0, screenSize);
        this._addOcto("Octo Flat X", -Math.PI / 2.0 + Math.PI / 8.0, screenSize);
        this._addOctoX8(screenSize);
        this._addBicopter(screenSize);
        this._addVTailQuad(screenSize);
        this._addATailQuad(screenSize);
        this._addY4(screenSize);
        this._addY6(screenSize);
    }

    _addY6(screenSize)
    {
        const frameRadius = 0.30 * screenSize;
        this["Y6"] =
        {
            PropRadius: 0.15 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x:            0,  y:  frameRadius * 0.7, top: true},
                {x:  frameRadius * 0.7,  y: -frameRadius * 0.7, top: true},
                {x: -frameRadius * 0.7,  y: -frameRadius * 0.7, top: true},
                {x:            0,  y:  frameRadius * 1.1, bottom: true},
                {x:  frameRadius * 1.1,  y: -frameRadius * 1.1, bottom: true},
                {x: -frameRadius * 1.1,  y: -frameRadius * 1.1, bottom: true},
            ],
        };
    }

    _addY4(screenSize)
    {
        const frameRadius = 0.30 * screenSize;
        this["Y4"] =
        {
            PropRadius: 0.15 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x:            0,  y:  frameRadius * 0.7, top: true},
                {x:  frameRadius,  y: -frameRadius},
                {x:            0,  y:  frameRadius * 1.1, bottom: true},
                {x: -frameRadius,  y: -frameRadius},
            ],
        };
    }

    _addVTailQuad(screenSize)
    {
        const frameRadius = 0.30 * screenSize;
        this["V-tail Quad"] =
        {
            PropRadius: 0.15 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x:  frameRadius * 0.7,  y:  frameRadius * 0.7},
                {x:  frameRadius,  y: -frameRadius},
                {x: -frameRadius * 0.7,  y:  frameRadius * 0.7},
                {x: -frameRadius,  y: -frameRadius},
            ],
        };
    }

    _addATailQuad(screenSize)
    {
        const frameRadius = 0.30 * screenSize;
        this["A-tail Quad"] =
        {
            PropRadius: 0.15 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x: -frameRadius * 0.7,  y:  frameRadius * 0.7},
                {x:  frameRadius,  y: -frameRadius},
                {x:  frameRadius * 0.7,  y:  frameRadius * 0.7},
                {x: -frameRadius,  y: -frameRadius},
            ],
        };
    }

    _addBicopter(screenSize)
    {
        const frameRadius = 0.35 * screenSize;
        this["Bicopter"] =
        {
            PropRadius: 0.2 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x: -frameRadius,  y: 0,},
                {x:  frameRadius,  y: 0,},
            ],
        };
    }

    _addOctoX8(screenSize)
    {
        const frameRadius = 0.20 * screenSize;
        const frameRadius2 = 0.28 * screenSize;
        this["Octo X8"] =
        {
            PropRadius: 0.12 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors:
            [
                {x:  frameRadius,  y:  frameRadius, top: true},
                {x:  frameRadius,  y: -frameRadius, top: true},
                {x: -frameRadius,  y:  frameRadius, top: true},
                {x: -frameRadius,  y: -frameRadius, top: true},
                {x:  frameRadius2,  y:  frameRadius2, bottom: true},
                {x:  frameRadius2,  y: -frameRadius2, bottom: true},
                {x: -frameRadius2,  y:  frameRadius2, bottom: true},
                {x: -frameRadius2,  y: -frameRadius2, bottom: true},
            ],
        };
    }

    _addOcto(frameName, rotateAngle, screenSize)
    {
        const frameRadius = 0.35 * screenSize;
        this[frameName] =
        {
            PropRadius: 0.10 * screenSize,
            ArmWidth: 0.1 * screenSize,
            Motors: [],
        };
        const dAngle = Math.PI / 4;

        let angle = -dAngle * 2 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 0 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 2 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 4 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = -dAngle * 1 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 1 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = dAngle * 3 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});

        angle = -dAngle * 3 + rotateAngle;
        this[frameName].Motors.push({x: Math.cos(angle) * frameRadius, y: Math.sin(angle) * frameRadius});
    }
}
