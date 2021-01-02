'use strict';

class VtxDeviceStatusTramp extends VtxDeviceStatus {
    constructor(dataView)
    {
        super(dataView);

        dataView.readU8(); // custom device status size

        // Read other Tramp VTX device parameters here
    }

    static get staticDeviceStatusType()
    {
        return VtxDeviceTypes.VTXDEV_TRAMP;
    }
}

vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusTramp);
