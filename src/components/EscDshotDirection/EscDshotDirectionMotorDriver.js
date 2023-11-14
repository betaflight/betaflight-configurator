import EscDshotCommandQueue from './EscDshotCommandQueue.js';
import DshotCommand from '../../js/utils/DshotCommand.js';
import MSPCodes from '../../js/msp/MSPCodes.js';
import { gui_log } from "../../js/gui_log";

class EscDshotDirectionMotorDriver
{
    constructor(motorConfig, motorDriverQueueIntervalMs, motorDriverStopMotorsPauseMs)
    {
        this._numberOfMotors = motorConfig.numberOfMotors;
        this._motorStopValue = motorConfig.motorStopValue;
        this._motorSpinValue = motorConfig.motorSpinValue;
        this._motorDriverStopMotorsPauseMs = motorDriverStopMotorsPauseMs;

        this._state = [];

        for (let  i = 0; i < this._numberOfMotors; i++)
        {
            this._state.push(this._motorStopValue);
        }

        this._stateStack = [];

        this._EscDshotCommandQueue = new EscDshotCommandQueue(motorDriverQueueIntervalMs);
    }

    activate()
    {
        this._EscDshotCommandQueue.start();
    }

    deactivate()
    {
        this._EscDshotCommandQueue.stopWhenEmpty();
    }

    stopMotor(motorIndex)
    {
        this._spinMotor(motorIndex, this._motorStopValue);
    }


    spinMotor(motorIndex)
    {
        this._spinMotor(motorIndex, this._motorSpinValue);
    }

    spinAllMotors()
    {
        this._spinAllMotors(this._motorSpinValue);
    }

    stopAllMotors()
    {
        this._spinAllMotors(this._motorStopValue);
    }

    stopAllMotorsNow()
    {
        this._EscDshotCommandQueue.clear();
        this._spinAllMotors(this._motorStopValue);
    }

    setEscSpinDirection(motorIndex, direction)
    {
        let needStopMotor = false;

        if (DshotCommand.ALL_MOTORS === motorIndex) {
            needStopMotor = this._isAnythingSpinning();
        } else {
            needStopMotor = this._isMotorSpinning(motorIndex);
        }

        if (needStopMotor) {
            this._pushState();
            this._spinMotor(motorIndex, this._motorStopValue);
            this._EscDshotCommandQueue.pushPause(this._motorDriverStopMotorsPauseMs);
            this._sendEscSpinDirection(motorIndex, direction);
            this._popState();
            this._sendState();
        } else {
            this._sendEscSpinDirection(motorIndex, direction);
        }
    }

    _pushState()
    {
        const state = [...this._state];
        this._stateStack.push(state);
    }

    _popState()
    {
        const state = this._stateStack.pop();
        this._state = [...state];
    }

    _isAnythingSpinning()
    {
        let result = false;

        for (let  i = 0; i < this._numberOfMotors; i++) {
            if (this._motorStopValue !== this._state[i]) {
                result = true;
                break;
            }
        }

        return result;
    }

    _isMotorSpinning(motorIndex)
    {
        return (this._motorStopValue !== this._state[motorIndex]);
    }

    _sendEscSpinDirection(motorIndex, direction)
    {
        const buffer = [];
        buffer.push8(DshotCommand.dshotCommandType_e.DSHOT_CMD_TYPE_BLOCKING);
        buffer.push8(motorIndex);
        buffer.push8(2); // two commands
        buffer.push8(direction);
        buffer.push8(DshotCommand.dshotCommands_e.DSHOT_CMD_SAVE_SETTINGS);
        this._EscDshotCommandQueue.pushCommand(MSPCodes.MSP2_SEND_DSHOT_COMMAND, buffer);

        let logString = "";
        if (motorIndex === DshotCommand.ALL_MOTORS) {
            logString += i18n.getMessage('motorsText');
        } else {
            const  motorNumber = motorIndex+1;
            logString += i18n.getMessage(`motorNumber${motorNumber}`);
        }
        logString += ': ';
        if (direction === DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1) {
            logString += i18n.getMessage('escDshotDirectionDialog-CommandNormal');
        } else {
            logString += i18n.getMessage('escDshotDirectionDialog-CommandReverse');
        }
        gui_log(logString);
    }

    _spinMotor(motorIndex, value)
    {
        if (DshotCommand.ALL_MOTORS === motorIndex) {
            this._spinAllMotors(value);
        } else {
            this._state[motorIndex] = value;
            this._sendState();
        }
    }

    _spinAllMotors(value)
    {
        for (let  i = 0; i < this._numberOfMotors; i++) {
            this._state[i] = value;
        }

        this._sendState();
    }

    _sendState()
    {
        const buffer = [];

        for (let  i = 0; i < this._numberOfMotors; i++) {
            buffer.push16(this._state[i]);
        }

        this._EscDshotCommandQueue.pushCommand(MSPCodes.MSP_SET_MOTOR, buffer);
    }

}

export default EscDshotDirectionMotorDriver;
