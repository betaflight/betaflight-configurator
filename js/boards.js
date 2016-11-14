'use strict';

// This list has been extracted from the firmware source with:
// grep TARGET_BOARD_IDENTIFIER src/main/target/*/target.h | sed -n "s/^src\/main\/target\/\([^\/]*\).*#define TARGET_BOARD_IDENTIFIER \"\([^\"]*\).*$/{name: '\1', identifier: '\2', vcp: false},/p" | sort
// and then manually setting vcp to true for boards that use VCP

var BOARD_DEFINITIONS = [
    {name: 'AIORACERF3', identifier: 'ARF3', vcp: true},
    {name: 'AIR32', identifier: 'AR32', vcp: true},
    {name: 'AIRHEROF3', identifier: 'AIR3', vcp: false},
    {name: 'ALIENFLIGHTF1', identifier: 'AFF1', vcp: false},
    {name: 'ALIENFLIGHTF3', identifier: 'AFF3', vcp: true},
    {name: 'ALIENFLIGHTF4', identifier: 'AFF4', vcp: true},
    {name: 'ANYFCF7', identifier: 'ANY7', vcp: true},
    {name: 'BETAFLIGHTF3', identifier: 'BFF3', vcp: true},
    {name: 'BLUEJAYF4', identifier: 'BJF4', vcp: true},
    {name: 'CC3D', identifier: 'CC3D', vcp: true},
    {name: 'CHEBUZZF3', identifier: 'CHF3', vcp: true},
    {name: 'CJMCU', identifier: 'CJM1', vcp: false},
    {name: 'COLIBRI', identifier: 'COLI', vcp: true},
    {name: 'COLIBRI_RACE', identifier: 'CLBR', vcp: true},
    {name: 'DOGE', identifier: 'DOGE', vcp: true},
    {name: 'F4BY', identifier: 'F4BY', vcp: true},
    {name: 'FURYF3', identifier: 'FYF3', vcp: true},
    {name: 'FURYF4', identifier: 'FYF4', vcp: true},
    {name: 'FURYF7', identifier: 'FYF7', vcp: true},
    {name: 'IMPULSERCF3', identifier: 'IMF3', vcp: true},
    {name: 'IRCFUSIONF3', identifier: 'IFF3', vcp: true},
    {name: 'ISHAPEDF3', identifier: 'ISF3', vcp: false},
    {name: 'KAKUTEF4', identifier: 'KTV1', vcp: true},
    {name: 'KISSFC', identifier: 'KISS', vcp: true},
    {name: 'LUXV2_RACE', identifier: 'LUXR', vcp: true},
    {name: 'LUX_RACE', identifier: 'LUX', vcp: true},
    {name: 'MICROSCISKY', identifier: 'MSKY', vcp: false},
    {name: 'MOTOLAB', identifier: 'MOTO', vcp: true},
    {name: 'MULTIFLITEPICO', identifier: 'MFPB', vcp: false},
    {name: 'AFROMINI', identifier: 'AFMN', vcp: false},
    {name: 'NAZE', identifier: 'AFNA', vcp: false},
    {name: 'BEEBRAIN', identifier: 'BEBR', vcp: false},
    {name: 'OMNIBUSF4', identifier: 'OBF4', vcp: true},
    {name: 'OMNIBUS', identifier: 'OMNI', vcp: true},
    {name: 'PIKOBLX', identifier: 'PIKO', vcp: true},
    {name: 'RACEBASE', identifier: 'RBFC', vcp: false},
    {name: 'RCEXPLORERF3', identifier: 'REF3', vcp: true},
    {name: 'AIRBOTF4', identifier: 'AIR4', vcp: true},
    {name: 'REVOLT', identifier: 'RVLT', vcp: true},
    {name: 'REVO', identifier: 'REVO', vcp: true},
    {name: 'REVONANO', identifier: 'REVN', vcp: true},
    {name: 'RMDO', identifier: 'RMDO', vcp: false},
    {name: 'SINGULARITY', identifier: 'SING', vcp: true},
    {name: 'SIRINFPV', identifier: 'SIRF', vcp: true},
    {name: 'SOULF4', identifier: 'SOUL', vcp: true},
    {name: 'SPARKY2', identifier: 'SPK2', vcp: true},
    {name: 'SPARKY', identifier: 'SPKY', vcp: true},
    {name: 'SPRACINGF3EVO', identifier: 'SPEV', vcp: true},
    {name: 'SPRACINGF3', identifier: 'SRF3', vcp: false},
    {name: 'SPRACINGF3MINI', identifier: 'SRFM', vcp: true},
    {name: 'STM32F3DISCOVERY', identifier: 'SDF3', vcp: true},
    {name: 'VRRACE', identifier: 'VRRA', vcp: true},
    {name: 'X_RACERSPI', identifier: 'XRC3', vcp: false},
    {name: 'YUPIF4', identifier: 'YPF4', vcp: true},
    {name: 'ZCOREF3', identifier: 'ZCF3', vcp: false}
];

var DEFAULT_BOARD_DEFINITION = {
    name: "Unknown", identifier: "????", vcp: false
};

var BOARD = {};

BOARD.find_board_definition = function (identifier) {
    for (var i = 0; i < BOARD_DEFINITIONS.length; i++) {
        var candidate = BOARD_DEFINITIONS[i];

        if (candidate.identifier == identifier) {
            return candidate;
        }
    }
    return DEFAULT_BOARD_DEFINITION;
};
