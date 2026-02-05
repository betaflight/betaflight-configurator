/**
 * AUTHOR: Jonny Alva
 * PROJECT: FPV Field Operations - Extreme Environment Preset
 * MISSION: Optimization for high-interference and low-resource logging.
 /**
 * AUTHOR: Jonny Alva
 * PROJECT: FPV Field Operations - Extreme Environment Preset
 * MISSION: Optimization for high-interference and low-resource logging.
 */

import { fc } from 'src/js/fc.js';
import { msp } from 'src/js/msp.js';
import { portHandler } from 'src/js/port_handler.js';
import { dataStorage } from 'src/js/data_storage.js';


const extremeSignalPreset = {
    linkQualityThreshold: 85,
    telemetryPriority: "HIGH",
    interferenceMitigation: "ACTIVE",
    lowResourceLogging: true
};

export default extremeSignalPreset;
