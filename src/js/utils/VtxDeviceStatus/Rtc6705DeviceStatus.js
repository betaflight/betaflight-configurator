'use strict';

class VtxDeviceStatusRtc6705 extends VtxDeviceStatus {
    constructor(dataView)
    {
        super(dataView);

        dataView.readU8(); // custom device status size

        // Read other Tramp VTX device parameters here
    }

    static get staticDeviceStatusType()
    {
        return VtxDeviceTypes.VTXDEV_RTC6705;
    }
}

vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusRtc6705);
