'use strict';

const VtxDeviceTypes = {
    VTXDEV_UNSUPPORTED: 0, // reserved for MSP
    VTXDEV_RTC6705: 1,
    // 2 reserved
    VTXDEV_SMARTAUDIO: 3,
    VTXDEV_TRAMP: 4,
    VTXDEV_UNKNOWN:  0xFF,
};

class VtxDeviceStatus
{
    constructor(dataView)
    {
        this._deviceIsReady = dataView.readU8();
        const bandAndChannelAvailable = Boolean(dataView.readU8());
        this._band = dataView.readU8();
        this._channel = dataView.readU8();

        if (!bandAndChannelAvailable) {
            this._band = undefined;
            this._channel = undefined;
        }

        const powerIndexAvailable = Boolean(dataView.readU8());
        this._powerIndex = dataView.readU8();

        if (!powerIndexAvailable) {
            this._powerIndex = undefined;
        }

        const frequencyAvailable = Boolean(dataView.readU8());
        this._frequency = dataView.readU16();

        if (!frequencyAvailable) {
            this._frequency = undefined;
        }

        const vtxStatusAvailable = Boolean(dataView.readU8());
        this._vtxStatus = dataView.readU32(); // pitmode and/or locked

        if (!vtxStatusAvailable) {
            this._vtxStatus = undefined;
        }

        this._readPowerLevels(dataView);
    }

    _readPowerLevels(dataView)
    {
        this._levels = [];
        this._powers = [];
        const powerLevelCount = dataView.readU8();

        for (let i = 0; i < powerLevelCount; i++)
        {
            this._levels.push(dataView.readU16());
            this._powers.push(dataView.readU16());
        }
    }

    get deviceIsReady()
    {
        return this._deviceIsReady;
    }

    // overload this function in subclasses
    static get staticDeviceStatusType()
    {
        return VtxDeviceTypes.VTXDEV_UNKNOWN;
    }

    get deviceStatusType()
    {
        // returns result of overloaded static function "staticDeviceStatusType"
        return this.constructor.staticDeviceStatusType;
    }
}
