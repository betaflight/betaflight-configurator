import VtxDeviceStatus, { VtxDeviceTypes } from './VtxDeviceStatus';

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

export default VtxDeviceStatusRtc6705;
