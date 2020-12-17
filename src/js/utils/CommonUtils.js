'use strict';

class CommonUtils
{
    static GetMixerImageSrc(mixerIndex, reverseMotorDir, apiVersion)
    {
        let reverse = "";

        if (semver.gte(apiVersion, API_VERSION_1_36)) {
            reverse = reverseMotorDir ? "_reversed" : "";
        }

        return `./resources/motor_order/${mixerList[mixerIndex - 1].image}${reverse}.svg`;
    }
}
