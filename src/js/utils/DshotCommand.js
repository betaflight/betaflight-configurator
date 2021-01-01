'use strict';

class DshotCommand
{
    static get ALL_MOTORS() { return 255; }
}

DshotCommand.dshotCommands_e = {
    DSHOT_CMD_MOTOR_STOP: 0,
    DSHOT_CMD_BEACON1: 1,
    DSHOT_CMD_BEACON2: 2,
    DSHOT_CMD_BEACON3: 3,
    DSHOT_CMD_BEACON4: 4,
    DSHOT_CMD_BEACON5: 5,
    DSHOT_CMD_ESC_INFO: 6, // V2 includes settings
    DSHOT_CMD_SPIN_DIRECTION_1: 7,
    DSHOT_CMD_SPIN_DIRECTION_2: 8,
    DSHOT_CMD_3D_MODE_OFF: 9,
    DSHOT_CMD_3D_MODE_ON: 10,
    DSHOT_CMD_SETTINGS_REQUEST: 11, // Currently not implemented
    DSHOT_CMD_SAVE_SETTINGS: 12,
    DSHOT_CMD_SPIN_DIRECTION_NORMAL: 20,
    DSHOT_CMD_SPIN_DIRECTION_REVERSED: 21,
    DSHOT_CMD_LED0_ON: 22, // BLHeli32 only
    DSHOT_CMD_LED1_ON: 23, // BLHeli32 only
    DSHOT_CMD_LED2_ON: 24, // BLHeli32 only
    DSHOT_CMD_LED3_ON: 25, // BLHeli32 only
    DSHOT_CMD_LED0_OFF: 26, // BLHeli32 only
    DSHOT_CMD_LED1_OFF: 27, // BLHeli32 only
    DSHOT_CMD_LED2_OFF: 28, // BLHeli32 only
    DSHOT_CMD_LED3_OFF: 29, // BLHeli32 only
    DSHOT_CMD_AUDIO_STREAM_MODE_ON_OFF: 30, // KISS audio Stream mode on/Off
    DSHOT_CMD_SILENT_MODE_ON_OFF: 31, // KISS silent Mode on/Off
    DSHOT_CMD_MAX: 47,
};

DshotCommand.dshotCommandType_e = {
    DSHOT_CMD_TYPE_INLINE: 0,    // dshot commands sent inline with motor signal (motors must be enabled)
    DSHOT_CMD_TYPE_BLOCKING: 1,  // dshot commands sent in blocking method (motors must be disabled)
};
