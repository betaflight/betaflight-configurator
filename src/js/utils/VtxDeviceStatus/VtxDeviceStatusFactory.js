import VtxDeviceStatus from './VtxDeviceStatus';

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

export default vtxDeviceStatusFactory;
