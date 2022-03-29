'use strict';

class VtxDeviceStatusMsp extends VtxDeviceStatus {
    constructor(dataView)
    {
        super(dataView);

        dataView.readU8(); // custom device status size

        // Read other MSP VTX device parameters here
    }

    static get staticDeviceStatusType()
    {
        return VtxDeviceTypes.VTXDEV_MSP;
    }
}

vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusMsp);
