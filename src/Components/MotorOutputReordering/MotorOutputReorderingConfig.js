'use strict';

function MotorOutputReorderConfig(screenSize)
{
    this.FrameColor = 'rgb(186, 186, 186)';
    this.PropEdgeColor = 'rgb(255, 187, 0)';
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
    let frameRaduis = 0.28 * screenSize;
    this["Quad X"] =
    {
        PropRadius: 0.2 * screenSize,
        ArmWidth: 0.1 * screenSize,
        Motors:
        [
            {x:  frameRaduis,  y:  frameRaduis},
            {x:  frameRaduis,  y: -frameRaduis},
            {x: -frameRaduis,  y:  frameRaduis},
            {x: -frameRaduis,  y: -frameRaduis},
        ],
    };

    //===========================================
    frameRaduis = 0.28 * screenSize;
    this["Quad X 1234"] =
    {
        PropRadius: 0.2 * screenSize,
        ArmWidth: 0.1 * screenSize,
        Motors:
        [
            {x: -frameRaduis,  y: -frameRaduis},
            {x:  frameRaduis,  y: -frameRaduis},
            {x:  frameRaduis,  y:  frameRaduis},
            {x: -frameRaduis,  y:  frameRaduis},
        ],
    };

    //===========================================
    frameRaduis = 0.32 * screenSize;
    this["Quad +"] =
    {
        PropRadius: 0.15 * screenSize,
        ArmWidth: 0.1 * screenSize,
        Motors:
        [
            {x:            0,  y:  frameRaduis},
            {x:  frameRaduis,  y:  0          },
            {x: -frameRaduis,  y:  0          },
            {x:            0,  y: -frameRaduis},
        ],
    };

    //===========================================
    frameRaduis = 0.30 * screenSize;
    this["Tricopter"] =
    {
        PropRadius: 0.15 * screenSize,
        ArmWidth: 0.1 * screenSize,
        Motors:
        [
            {x:            0,  y:  frameRaduis},
            {x:  frameRaduis,  y: -frameRaduis},
            {x: -frameRaduis,  y: -frameRaduis},
        ],
    };

    //===========================================
    frameRaduis = 0.35 * screenSize;
    this["Hex +"] =
    {
        PropRadius: 0.14 * screenSize,
        ArmWidth: 0.1 * screenSize,
        Motors: [],
    };
    let dAngle = Math.PI / 3;
    let angle = 0;

    angle = dAngle * 1;
    this["Hex +"].Motors.push({x: Math.sin(angle) * frameRaduis, y: Math.cos(angle) * frameRaduis});

    angle = dAngle * 2;
    this["Hex +"].Motors.push({x: Math.sin(angle) * frameRaduis, y: Math.cos(angle) * frameRaduis});

    angle = -dAngle * 1;
    this["Hex +"].Motors.push({x: Math.sin(angle) * frameRaduis, y: Math.cos(angle) * frameRaduis});

    angle = -dAngle * 2;
    this["Hex +"].Motors.push({x: Math.sin(angle) * frameRaduis, y: Math.cos(angle) * frameRaduis});

    angle = dAngle * 3;
    this["Hex +"].Motors.push({x: Math.sin(angle) * frameRaduis, y: Math.cos(angle) * frameRaduis});

    angle = dAngle * 0;
    this["Hex +"].Motors.push({x: Math.sin(angle) * frameRaduis, y: Math.cos(angle) * frameRaduis});

    //===========================================
    frameRaduis = 0.35 * screenSize;
    this["Hex X"] =
    {
        PropRadius: 0.14 * screenSize,
        ArmWidth: 0.1 * screenSize,
        Motors: [],
    };
    dAngle = Math.PI / 3;

    angle = dAngle * 1;
    this["Hex X"].Motors.push({x: Math.cos(angle) * frameRaduis, y: Math.sin(angle) * frameRaduis});

    angle = -dAngle * 1;
    this["Hex X"].Motors.push({x: Math.cos(angle) * frameRaduis, y: Math.sin(angle) * frameRaduis});

    angle = dAngle * 2;
    this["Hex X"].Motors.push({x: Math.cos(angle) * frameRaduis, y: Math.sin(angle) * frameRaduis});

    angle = -dAngle * 2;
    this["Hex X"].Motors.push({x: Math.cos(angle) * frameRaduis, y: Math.sin(angle) * frameRaduis});

    angle = dAngle * 0;
    this["Hex X"].Motors.push({x: Math.cos(angle) * frameRaduis, y: Math.sin(angle) * frameRaduis});

    angle = dAngle * 3;
    this["Hex X"].Motors.push({x: Math.cos(angle) * frameRaduis, y: Math.sin(angle) * frameRaduis});
}
