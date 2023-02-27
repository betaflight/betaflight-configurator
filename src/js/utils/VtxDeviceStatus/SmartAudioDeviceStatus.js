import VtxDeviceStatus, { VtxDeviceTypes } from "./VtxDeviceStatus";
import { i18n } from "../../localization";

class VtxDeviceStatusSmartAudio extends VtxDeviceStatus {
    constructor(dataView)
    {
        super(dataView);

        dataView.readU8(); // custom device status size

        this._version = dataView.readU8();
        this._mode = dataView.readU8();
        this._orfreq = dataView.readU16();
        this._willBootIntoPitMode = Boolean(dataView.readU8());
    }

    get smartAudioVersion()
    {
        const sa = this._version * 100 + this._mode;
        let result = "";

        switch (this._version) {
            case 1:
                result = "1.0";
                break;
            case 2:
                result = "2.0";
                break;
            case 3:
                result = "2.1";
                break;
            default:
                // unknown SA version
                result = i18n.getMessage("vtxType_255");
        }

        if (16 == this._mode) {
            result = i18n.getMessage("vtxSmartAudioUnlocked", {"version": result});
        }

        return result;
    }

    static get staticDeviceStatusType()
    {
        return VtxDeviceTypes.VTXDEV_SMARTAUDIO;
    }
}

export default VtxDeviceStatusSmartAudio;
