import VtxDeviceStatus from './VtxDeviceStatus';
import VtxDeviceStatusSmartAudio from './SmartAudioDeviceStatus';
import VtxDeviceStatusTramp from './TrampDeviceStatus';
import VtxDeviceStatusMsp from './VtxMspDeviceStatus';
import VtxDeviceStatusRtc6705 from './Rtc6705DeviceStatus';

const vtxDeviceStatusFactory = {
    _vtxDeviceStatusClasses: [],

    // call this to register a new vtx type like SmartAudio, Tramp or Rtc6705
    registerVtxDeviceStatusClass: function(vtxDeviceStatusClass)
    {
        this._vtxDeviceStatusClasses.push(vtxDeviceStatusClass);
    },

    createVtxDeviceStatus: function(byteArray)
    {
        const dataView = new DataView(byteArray.buffer);

        const vtxTypeIndex = dataView.readU8();
        const vtxDeviceStatusClass = this._getDeviceStatusClass(vtxTypeIndex);

        return new vtxDeviceStatusClass(dataView);
    },

    _readVtxType: function(dataView)
    {
        return dataView.readU8();
    },

    _getDeviceStatusClass: function(vtxTypeIndex)
    {
        let result = this._vtxDeviceStatusClasses.find(
            (vtxClass) => {
                return vtxClass.staticDeviceStatusType === vtxTypeIndex;
            });

        if (typeof result === 'undefined') {
            result = VtxDeviceStatus;
        }

        return result;
    },
};

vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusSmartAudio);
vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusTramp);
vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusMsp);
vtxDeviceStatusFactory.registerVtxDeviceStatusClass(VtxDeviceStatusRtc6705);

export default vtxDeviceStatusFactory;
