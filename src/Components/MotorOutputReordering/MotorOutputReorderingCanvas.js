'use strict';

class MotorOutputReorderCanvas
{
    constructor(canvas, droneConfiguration, motorClickCallback, spinMotorCallback)
    {
        this._spinMotorCallback = spinMotorCallback;
        this._canvas = canvas;
        this._motorClickCallback = motorClickCallback;
        this._width = this._canvas.width();
        this._height = this._canvas.height();
        this._screenSize = Math.min(this._width, this._height);

        this._config = new MotorOutputReorderConfig(this._screenSize);

        // no component resize allowing yet
        this._canvas.prop({
            width: this._width,
            height: this._height,
        });

        this._droneConfiguration = droneConfiguration;

        this._ctx = this._canvas[0].getContext("2d");
        this._ctx.translate(this._width / 2, this._height / 2);

        this._canvas.mousemove((event) =>
        {
            this._onMouseMove(event);
        });
        this._canvas.mouseleave(() =>
        {
            this._onMouseLeave();
        });
        this._canvas.mousedown(() =>
        {
            this._onMouseDown();
        });
        this._canvas.mouseup(() =>
        {
            this._onMouseUp(event);
        });
        this._canvas.click(() =>
        {
            this._onMouseClick();
        });

        this.startOver();
    }

    pause()
    {
        this._keepDrawing = false;
    }

    startOver()
    {
        this.readyMotors = []; //motors that already being selected for remapping by user
        this.remappingReady = false;
        this._motorIndexToSpinOnMouseDown = -1;
        this._keepDrawing = true;
        this._mouse = {x : 0, y: 0};
        window.requestAnimationFrame(() =>
        {
            this._drawOnce();
        });
    }

    _drawOnce()
    {
        this._ctx.clearRect(-this._width / 2,  -this._height / 2, this._width, this._height);

        this._drawFrame();
        this._drawDirectionArrow();
        this._markMotors();
        this._drawMotors();

        if (this._keepDrawing) {
            window.requestAnimationFrame(() =>
            {
                this._drawOnce();
            });
        }
    }

    _onMouseDown()
    {
        if (this.remappingReady) {
            this._motorIndexToSpinOnMouseDown = this._getMouseHoverMotorIndex();

            if (this._spinMotorCallback) {
                this._spinMotorCallback(this._motorIndexToSpinOnMouseDown);
            }
        }
    }

    _onMouseUp()
    {
        if (-1 !== this._motorIndexToSpinOnMouseDown) {
            this._motorIndexToSpinOnMouseDown = -1;

            if (this._spinMotorCallback) {
                this._spinMotorCallback(this._motorIndexToSpinOnMouseDown);
            }
        }
    }

    _onMouseClick()
    {
        const motorIndex = this._getMouseHoverMotorIndex();

        if (this._motorClickCallback && -1 !== motorIndex && !this.readyMotors.includes(motorIndex)) {
            this._motorClickCallback(motorIndex);
        }
    }

    _onMouseMove(event)
    {
        const boundingRect = this._canvas[0].getBoundingClientRect();
        this._mouse.x = event.clientX - boundingRect.left - this._width / 2;
        this._mouse.y = event.clientY - boundingRect.top - this._height / 2;
    }

    _onMouseLeave()
    {
        this._mouse.x = Number.MIN_SAFE_INTEGER;
        this._mouse.y = Number.MIN_SAFE_INTEGER;

        if (-1 !== this._motorIndexToSpinOnMouseDown) {
            this._motorIndexToSpinOnMouseDown = -1;

            if (this._spinMotorCallback) {
                this._spinMotorCallback(this._motorIndexToSpinOnMouseDown);
            }
        }
    }

    _markMotors()
    {
        const motors = this._config[this._droneConfiguration].Motors;
        const mouseHoverMotorIndex = this._getMouseHoverMotorIndex();

        if (-1 === this._motorIndexToSpinOnMouseDown) {
            for (let i = 0; i < this.readyMotors.length; i++) {
                const motorIndex = this.readyMotors[i];
                this._ctx.beginPath();
                this._ctx.arc(motors[motorIndex].x, motors[motorIndex].y, this._config[this._droneConfiguration].PropRadius, 0, 2 * Math.PI);
                this._ctx.closePath();
                this._ctx.fillStyle = this._config.MotorReadyColor;
                this._ctx.fill();
            }

            if (-1 !== mouseHoverMotorIndex && !this.readyMotors.includes(mouseHoverMotorIndex)) {
                this._ctx.beginPath();
                this._ctx.arc(motors[mouseHoverMotorIndex].x, motors[mouseHoverMotorIndex].y, this._config[this._droneConfiguration].PropRadius, 0, 2 * Math.PI);
                this._ctx.closePath();
                this._ctx.fillStyle = this._config.MotorMouseHoverColor;
                this._ctx.fill();
            }
        } else {
            const spinningMotor = this._motorIndexToSpinOnMouseDown;

            for (let i = 0; i < motors.length; i++) {
                this._ctx.fillStyle = this._config.MotorReadyColor;
                if (spinningMotor === i) {
                    this._ctx.fillStyle = this._config.MotorSpinningColor;
                } else if (mouseHoverMotorIndex === i) {
                    this._ctx.fillStyle = this._config.MotorMouseHoverColor;
                }

                this._ctx.beginPath();
                this._ctx.arc(motors[i].x, motors[i].y, this._config[this._droneConfiguration].PropRadius, 0, 2 * Math.PI);
                this._ctx.closePath();
                this._ctx.fill();
            }
        }
    }

    _getMouseHoverMotorIndex()
    {
        const x = this._mouse.x;
        const y = this._mouse.y;

        let result = -1;
        let currentDist = Number.MAX_SAFE_INTEGER;
        const motors = this._config[this._droneConfiguration].Motors;

        for (let i = 0; i < motors.length; i++) {
            const dist = Math.sqrt((x - motors[i].x) * (x - motors[i].x) + (y - motors[i].y) * (y - motors[i].y));

            if (dist < this._config[this._droneConfiguration].PropRadius && dist < currentDist) {
                currentDist = dist;
                result = i;
            }
        }

        return result;
    }

    _drawMotors()
    {

        this._ctx.lineWidth = this._config.PropEdgeLineWidth;
        this._ctx.strokeStyle = this._config.PropEdgeColor;
        const motors = this._config[this._droneConfiguration].Motors;

        for (let i = 0; i < motors.length; i++) {
            this._ctx.beginPath();
            this._ctx.arc(motors[i].x, motors[i].y, this._config[this._droneConfiguration].PropRadius, 0, 2 * Math.PI);
            this._ctx.stroke();
        }
    }

    _drawDirectionArrow()
    {
        this._ctx.beginPath();
        this._ctx.moveTo(this._config.DirectionArrowPoints[0].x, this._config.DirectionArrowPoints[0].y);

        for (let i = 1; i < this._config.DirectionArrowPoints.length; i++) {
            this._ctx.lineTo(this._config.DirectionArrowPoints[i].x, this._config.DirectionArrowPoints[i].y);
        }

        this._ctx.closePath();
        this._ctx.fillStyle = this._config.ArrowColor;
        this._ctx.fill();
    }

    _drawFrame()
    {
        this._ctx.beginPath();
        this._ctx.lineWidth = this._config[this._droneConfiguration].ArmWidth;
        this._ctx.lineCap = "round";
        this._ctx.strokeStyle = this._config.FrameColor;
        const motors = this._config[this._droneConfiguration].Motors;

        switch(this._droneConfiguration) {
            case "Quad X":
            case "Quad +":
                this._ctx.moveTo(motors[0].x, motors[0].y);
                this._ctx.lineTo(motors[3].x, motors[3].y);
                this._ctx.moveTo(motors[1].x, motors[1].y);
                this._ctx.lineTo(motors[2].x, motors[2].y);
                break;
            case "Quad X 1234":
                this._ctx.moveTo(motors[0].x, motors[0].y);
                this._ctx.lineTo(motors[2].x, motors[2].y);
                this._ctx.moveTo(motors[3].x, motors[3].y);
                this._ctx.lineTo(motors[1].x, motors[1].y);
                break;
            case "Tricopter":
                this._ctx.moveTo(motors[1].x, motors[1].y);
                this._ctx.lineTo(motors[2].x, motors[2].y);
                this._ctx.moveTo(motors[0].x, motors[0].y);
                this._ctx.lineTo(motors[0].x, motors[2].y);
                break;
            case "Hex +":
            case "Hex X":
                this._ctx.moveTo(motors[0].x, motors[0].y);
                this._ctx.lineTo(motors[3].x, motors[3].y);
                this._ctx.moveTo(motors[1].x, motors[1].y);
                this._ctx.lineTo(motors[2].x, motors[2].y);
                this._ctx.moveTo(motors[4].x, motors[4].y);
                this._ctx.lineTo(motors[5].x, motors[5].y);
                break;
        }

        this._ctx.stroke();
    }
}
