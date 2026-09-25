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

import EscDshotCommandQueue from "./EscDshotCommandQueue";
import DshotCommand from "../../js/utils/DshotCommand";
import MSPCodes from "../../js/msp/MSPCodes";
import { gui_log } from "../../js/gui_log";
import { i18n } from "../../js/localization";
import { MspBuffer } from "../../js/msp/mspBytes";

export interface EscDshotMotorConfig {
    numberOfMotors: number;
    motorStopValue: number;
    motorSpinValue: number;
}

class EscDshotDirectionMotorDriver {
    private readonly _numberOfMotors: number;
    private readonly _motorStopValue: number;
    private readonly _motorSpinValue: number;
    private readonly _motorDriverStopMotorsPauseMs: number;
    private _state: number[];
    private readonly _stateStack: number[][];
    private readonly _EscDshotCommandQueue: EscDshotCommandQueue;

    constructor(
        motorConfig: EscDshotMotorConfig,
        motorDriverQueueIntervalMs: number,
        motorDriverStopMotorsPauseMs: number,
    ) {
        this._numberOfMotors = motorConfig.numberOfMotors;
        this._motorStopValue = motorConfig.motorStopValue;
        this._motorSpinValue = motorConfig.motorSpinValue;
        this._motorDriverStopMotorsPauseMs = motorDriverStopMotorsPauseMs;

        this._state = [];

        for (let i = 0; i < this._numberOfMotors; i++) {
            this._state.push(this._motorStopValue);
        }

        this._stateStack = [];

        this._EscDshotCommandQueue = new EscDshotCommandQueue(motorDriverQueueIntervalMs);
    }

    activate(): void {
        this._EscDshotCommandQueue.start();
    }

    deactivate(): void {
        this._EscDshotCommandQueue.stopWhenEmpty();
    }

    stopMotor(motorIndex: number): void {
        this._spinMotor(motorIndex, this._motorStopValue);
    }

    spinMotor(motorIndex: number): void {
        this._spinMotor(motorIndex, this._motorSpinValue);
    }

    spinAllMotors(): void {
        this._spinAllMotors(this._motorSpinValue);
    }

    stopAllMotors(): void {
        this._spinAllMotors(this._motorStopValue);
    }

    stopAllMotorsNow(): void {
        this._EscDshotCommandQueue.clear();
        this._spinAllMotors(this._motorStopValue);
    }

    setEscSpinDirection(motorIndex: number, direction: number): void {
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

    private _pushState(): void {
        const state = [...this._state];
        this._stateStack.push(state);
    }

    private _popState(): void {
        // Only called straight after _pushState, so the stack is never empty here.
        const state = this._stateStack.pop() as number[];
        this._state = [...state];
    }

    private _isAnythingSpinning(): boolean {
        let result = false;

        for (let i = 0; i < this._numberOfMotors; i++) {
            if (this._motorStopValue !== this._state[i]) {
                result = true;
                break;
            }
        }

        return result;
    }

    private _isMotorSpinning(motorIndex: number): boolean {
        return this._motorStopValue !== this._state[motorIndex];
    }

    private _sendEscSpinDirection(motorIndex: number, direction: number): void {
        const buffer = new MspBuffer();
        buffer.push8(DshotCommand.dshotCommandType_e.DSHOT_CMD_TYPE_BLOCKING);
        buffer.push8(motorIndex);
        buffer.push8(2); // two commands
        buffer.push8(direction);
        buffer.push8(DshotCommand.dshotCommands_e.DSHOT_CMD_SAVE_SETTINGS);
        this._EscDshotCommandQueue.pushCommand(MSPCodes.MSP2_SEND_DSHOT_COMMAND, buffer);

        let logString = "";
        if (motorIndex === DshotCommand.ALL_MOTORS) {
            logString += i18n.getMessage("motorsText");
        } else {
            const motorNumber = motorIndex + 1;
            logString += i18n.getMessage(`motorNumber${motorNumber}`);
        }
        logString += ": ";
        if (direction === DshotCommand.dshotCommands_e.DSHOT_CMD_SPIN_DIRECTION_1) {
            logString += i18n.getMessage("escDshotDirectionDialog-CommandNormal");
        } else {
            logString += i18n.getMessage("escDshotDirectionDialog-CommandReverse");
        }
        gui_log(logString);
    }

    private _spinMotor(motorIndex: number, value: number): void {
        if (DshotCommand.ALL_MOTORS === motorIndex) {
            this._spinAllMotors(value);
        } else {
            this._state[motorIndex] = value;
            this._sendState();
        }
    }

    private _spinAllMotors(value: number): void {
        for (let i = 0; i < this._numberOfMotors; i++) {
            this._state[i] = value;
        }

        this._sendState();
    }

    private _sendState(): void {
        const buffer = new MspBuffer();

        for (let i = 0; i < this._numberOfMotors; i++) {
            buffer.push16(this._state[i]);
        }

        this._EscDshotCommandQueue.pushCommand(MSPCodes.MSP_SET_MOTOR, buffer);
    }
}

export default EscDshotDirectionMotorDriver;
