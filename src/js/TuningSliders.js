'use strict';

const TuningSliders = {
    sliderPidsMode: 2,
    sliderMasterMultiplier: 1,
    sliderRollPitchRatio: 1,
    sliderIGain: 1,
    sliderPDRatio: 1,
    sliderPDGain: 1,
    sliderDMinRatio: 1,
    sliderFeedforwardGain: 1,
    pidSlidersUnavailable: false,
    GyroSliderUnavailable: false,
    DTermSliderUnavailable: false,
    FilterReset: false,

    sliderGyroFilter: 1,
    sliderGyroFilterMultiplier: 1,
    sliderDTermFilter: 1,
    sliderDTermFilterMultiplier: 1,

    dMinFeatureEnabled: true,
    defaultPDRatio: 0,
    PID_DEFAULT: [],
    FILTER_DEFAULT: {},

    cachedPidSliderValues: false,
    cachedGyroSliderValues: false,
    cachedDTermSliderValues: false,

    expertMode: false,
};

const D_MIN_RATIO = 0.85;

TuningSliders.setDMinFeatureEnabled = function(dMinFeatureEnabled) {
    this.dMinFeatureEnabled = dMinFeatureEnabled;
    if (this.dMinFeatureEnabled) {
        this.defaultPDRatio = this.PID_DEFAULT[2] / this.PID_DEFAULT[0];
    } else {
        this.defaultPDRatio = this.PID_DEFAULT[2] / (this.PID_DEFAULT[0] * (1 / D_MIN_RATIO));
    }
};

TuningSliders.initialize = function() {
    this.PID_DEFAULT = FC.getPidDefaults();
    this.FILTER_DEFAULT = FC.getFilterDefaults();

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.setDMinFeatureEnabled($('#dMinSwitch').is(':checked'));
    }

    this.setExpertMode($('input[name="expertModeCheckbox"]').is(':checked'));

    this.initPidSlidersPosition();
    this.initGyroFilterSliderPosition();
    this.initDTermFilterSliderPosition();

    // after refresh cached values are not available
    this.cachedPidSliderValues = false;
    this.cachedGyroSliderValues = false;
    this.cachedDTermSliderValues = false;

    this.updatePidSlidersDisplay();
    this.updateFilterSlidersDisplay();
};

TuningSliders.setExpertMode = function() {
    this.expertMode = isExpertModeEnabled();
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        const dMinShow = parseInt($('.pid_tuning input[name="dMinRoll"]').val()) !== 0;
        $('.tab-pid_tuning .MasterSlider').toggle(this.expertMode);
        $('.tab-pid_tuning .DMinRatioSlider').toggle(this.expertMode && dMinShow);
        $('.tab-pid_tuning .advancedSlider').toggle(this.expertMode);
    } else {
        $('#slidersPidsBox, #slidersFilterBox').toggleClass('nonExpertModeSliders', !this.expertMode);
        $('.tab-pid_tuning .advancedSlider').hide();
        $('.tab-pid_tuning .DMinRatioSlider').hide();
    }
};

TuningSliders.scaleSliderValue = function(value) {
    if (value > 1) {
        return Math.round(((value - 1) * 2 + 1) * 100) / 100;
    } else {
        return value;
    }
};

TuningSliders.downscaleSliderValue = function(value) {
    if (value > 1) {
        return (value - 1) / 2 + 1;
    } else {
        return value;
    }
};

TuningSliders.initPidSlidersPosition = function() {
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        // used to estimate PID slider positions based on PIDF values, and set respective slider position
        // provides only an estimation due to limitation of feature without firmware support, to be improved in later versions
        this.sliderMasterMultiplier = Math.round(FC.PIDS[2][1] / this.PID_DEFAULT[11] * 10) / 10;
        this.sliderPDRatio = Math.round(FC.PIDS[0][2] / FC.PIDS[0][0] / this.defaultPDRatio * 10) / 10;
        if (this.dMinFeatureEnabled) {
            this.sliderPDGain = Math.round(FC.ADVANCED_TUNING.dMinRoll / this.sliderPDRatio / this.sliderMasterMultiplier / this.PID_DEFAULT[3] * 10) / 10;
        } else {
            this.sliderPDGain = Math.round(FC.PIDS[0][0] / this.sliderMasterMultiplier / (this.PID_DEFAULT[2] * (1 / D_MIN_RATIO)) * 10) / 10;
        }
        this.sliderFeedforwardGain = Math.round(FC.ADVANCED_TUNING.feedforwardRoll / this.sliderMasterMultiplier / this.PID_DEFAULT[4] * 10) / 10;
    } else {
        this.sliderPidsMode = FC.TUNING_SLIDERS.slider_pids_mode;
        this.sliderMasterMultiplier = FC.TUNING_SLIDERS.slider_master_multiplier / 100;
        this.sliderRollPitchRatio = FC.TUNING_SLIDERS.slider_roll_pitch_ratio / 100;
        this.sliderIGain = FC.TUNING_SLIDERS.slider_i_gain / 100;
        this.sliderPDRatio = FC.TUNING_SLIDERS.slider_pd_ratio / 100;
        this.sliderPDGain = FC.TUNING_SLIDERS.slider_pd_gain / 100;
        this.sliderDMinRatio = FC.TUNING_SLIDERS.slider_dmin_ratio / 100;
        this.sliderFeedforwardGain = FC.TUNING_SLIDERS.slider_feedforward_gain / 100;
    }

    $('output[name="sliderMasterMultiplier-number"]').val(this.sliderMasterMultiplier);
    $('output[name="sliderRollPitchRatio-number"]').val(this.sliderRollPitchRatio);
    $('output[name="sliderIGain-number"]').val(this.sliderIGain);
    $('output[name="sliderPDRatio-number"]').val(this.sliderPDRatio);
    $('output[name="sliderPDGain-number"]').val(this.sliderPDGain);
    $('output[name="sliderDMinRatio-number"]').val(this.sliderDMinRatio);
    $('output[name="sliderFeedforwardGain-number"]').val(this.sliderFeedforwardGain);

    $('#sliderMasterMultiplier').val(this.downscaleSliderValue(this.sliderMasterMultiplier));
    $('#sliderRollPitchRatio').val(this.downscaleSliderValue(this.sliderRollPitchRatio));
    $('#sliderIGain').val(this.downscaleSliderValue(this.sliderIGain));
    $('#sliderPDRatio').val(this.downscaleSliderValue(this.sliderPDRatio));
    $('#sliderPDGain').val(this.downscaleSliderValue(this.sliderPDGain));
    $('#sliderDMinRatio').val(this.downscaleSliderValue(this.sliderDMinRatio));
    $('#sliderFeedforwardGain').val(this.downscaleSliderValue(this.sliderFeedforwardGain));
};

TuningSliders.initGyroFilterSliderPosition = function() {
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.sliderGyroFilterMultiplier = Math.floor((FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz + FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz + FC.FILTER_CONFIG.gyro_lowpass2_hz) /
                        (this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz + this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz + this.FILTER_DEFAULT.gyro_lowpass2_hz) * 100) / 100;
    } else {
        this.sliderGyroFilter = FC.TUNING_SLIDERS.slider_gyro_filter;
        this.sliderGyroFilterMultiplier = FC.TUNING_SLIDERS.slider_gyro_filter_multiplier / 100;
    }

    $('output[name="sliderGyroFilterMultiplier-number"]').val(this.sliderGyroFilterMultiplier);
    $('#sliderGyroFilterMultiplier').val(this.downscaleSliderValue(this.sliderGyroFilterMultiplier));
};

TuningSliders.initDTermFilterSliderPosition = function() {
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.sliderDTermFilterMultiplier = Math.floor((FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz + FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz + FC.FILTER_CONFIG.dterm_lowpass2_hz) /
                        (this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz + this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz + this.FILTER_DEFAULT.dterm_lowpass2_hz) * 100) / 100;
    } else {
        this.sliderDTermFilter = FC.TUNING_SLIDERS.slider_dterm_filter;
        this.sliderDTermFilterMultiplier = FC.TUNING_SLIDERS.slider_dterm_filter_multiplier / 100;
    }

    $('output[name="sliderDTermFilterMultiplier-number"]').val(this.sliderDTermFilterMultiplier);
    $('#sliderDTermFilterMultiplier').val(this.downscaleSliderValue(this.sliderDTermFilterMultiplier));
};

TuningSliders.resetPidSliders = function() {
    if (!this.cachedPidSliderValues) {
        this.sliderMasterMultiplier = 1;
        this.sliderRollPitchRatio = 1;
        this.sliderIGain = 1;
        this.sliderPDRatio = 1;
        this.sliderPDGain = 1;
        this.sliderDMinRatio = 1;
        this.sliderFeedforwardGain = 1;
    }

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        $('#sliderMasterMultiplier').val(this.downscaleSliderValue(this.sliderMasterMultiplier));
        $('#sliderPDRatio').val(this.downscaleSliderValue(this.sliderPDRatio));
        $('#sliderPDGain').val(this.downscaleSliderValue(this.sliderPDGain));
        $('#sliderFeedforwardGain').val(this.downscaleSliderValue(this.sliderFeedforwardGain));
    } else {
        this.initPidSlidersPosition();
    }

    this.calculateNewPids();
};

TuningSliders.resetGyroFilterSlider = function() {
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        if (!this.cachedGyroSliderValues) {
            this.sliderGyroFilterMultiplier = 1;
        }
        this.sliderGyroFilter = 1;
        FC.TUNING_SLIDERS.slider_gyro_filter = 1;
        this.initGyroFilterSliderPosition();
    } else {
        this.sliderGyroFilterMultiplier = 1;
        $('#sliderGyroFilterMultiplier').val(this.downscaleSliderValue(this.sliderGyroFilterMultiplier));
    }
    this.FilterReset = true;
    this.calculateNewGyroFilters();

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.updateFilterSlidersDisplay();
    }
};

TuningSliders.resetDTermFilterSlider = function() {
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        if (!this.cachedDTermSliderValues) {
            this.sliderDTermFilterMultiplier = 1;
        }
        this.sliderDtermFilter = 1;
        FC.TUNING_SLIDERS.slider_dterm_filter = 1;
        this.initDTermFilterSliderPosition();
    } else {
        this.sliderDTermFilterMultiplier = 1;
        $('#sliderDTermFilterMultiplier').val(this.downscaleSliderValue(this.sliderDTermFilterMultiplier));
    }
    this.FilterReset = true;
    this.calculateNewDTermFilters();

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.updateFilterSlidersDisplay();
    }
};

TuningSliders.legacyUpdateFilterSlidersDisplay = function() {
    if (parseInt($('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val()) !==
            Math.floor(this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz * this.sliderGyroFilterMultiplier) ||
        parseInt($('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val()) !==
            Math.floor(this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz * this.sliderGyroFilterMultiplier) ||
        parseInt($('.pid_filter select[name="gyroLowpassDynType"]').val()) !== this.FILTER_DEFAULT.gyro_lowpass_type ||
        parseInt($('.pid_filter input[name="gyroLowpass2Frequency"]').val()) !==
            Math.floor(this.FILTER_DEFAULT.gyro_lowpass2_hz * this.sliderGyroFilterMultiplier) ||
        parseInt($('.pid_filter select[name="gyroLowpass2Type"]').val()) !== this.FILTER_DEFAULT.gyro_lowpass2_type) {
        this.GyroSliderUnavailable = true;
    } else {
        this.cachedGyroSliderValues = true;
    }

    if (parseInt($('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val()) !==
            Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz * this.sliderDTermFilterMultiplier) ||
        parseInt($('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val()) !==
            Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz * this.sliderDTermFilterMultiplier) ||
        parseInt($('.pid_filter select[name="dtermLowpassDynType"]').val()) !== this.FILTER_DEFAULT.dterm_lowpass_type ||
        parseInt($('.pid_filter input[name="dtermLowpass2Frequency"]').val()) !==
            Math.round(this.FILTER_DEFAULT.dterm_lowpass2_hz * this.sliderDTermFilterMultiplier) ||
        parseInt($('.pid_filter select[name="dtermLowpass2Type"]').val()) !== this.FILTER_DEFAULT.dterm_lowpass2_type) {
        this.DTermSliderUnavailable = true;
    } else {
        this.cachedDTermSliderValues = true;
    }
};

TuningSliders.updatePidSlidersDisplay = function() {
    // check if pid values changed manually by comparing the current values with those calculated by the sliders,
    // if all of them are equal the values haven't been changed manually
    const WARNING_P_GAIN = 70;
    const WARNING_I_GAIN = 120;
    const WARNING_DMAX_GAIN = 60;
    const WARNING_DMIN_GAIN = 40;

    this.pidSlidersUnavailable = false;

    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.calculateNewPids(true);
    }

    FC.PID_NAMES.forEach(function (elementPid, indexPid) {
        const pidElements = $(`.pid_tuning .${elementPid} input`);
        pidElements.each(function (indexInput) {
            if (indexPid < 3 && indexInput < 3) {
                if (parseInt($(this).val()) !== FC.PIDS[indexPid][indexInput]) {
                    TuningSliders.pidSlidersUnavailable = true;
                }
            }
        });
    });

    if ($('input[id="useIntegratedYaw"]').is(':checked')) {
        this.pidSlidersUnavailable = true;
    }

    if (!this.pidSlidersUnavailable && !semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.cachedPidSliderValues = true;
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        if (this.sliderPidsMode === 0) {
           this.pidSlidersUnavailable = true;
        }
        this.setExpertMode();
    }

    $('.tuningPIDSliders').toggle(!this.pidSlidersUnavailable);
    $('.subtab-pid .slidersDisabled').toggle(this.pidSlidersUnavailable);
    $('.subtab-pid .nonExpertModeSlidersNote').toggle(!this.pidSlidersUnavailable && !this.expertMode && !semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44));
    $('.subtab-pid .slidersWarning').toggle((FC.PIDS[1][0] > WARNING_P_GAIN || FC.PIDS[1][1] > WARNING_I_GAIN || FC.PIDS[1][2] > WARNING_DMAX_GAIN ||
                                                FC.ADVANCED_TUNING.dMinPitch > WARNING_DMIN_GAIN) && !this.pidSlidersUnavailable);
};

TuningSliders.updateFilterSlidersDisplay = function() {
    // check if filters changed manually by comapring current value and those based on slider position
    const WARNING_FILTER_HIGH_GAIN = 1.4;
    const WARNING_FILTER_LOW_GAIN = 0.7;

    this.GyroSliderUnavailable = false;
    this.DTermSliderUnavailable = false;

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        if (FC.TUNING_SLIDERS.slider_gyro_filter === 0) {
            this.GyroSliderUnavailable = true;
        }
        if (FC.TUNING_SLIDERS.slider_dterm_filter === 0) {
            this.DTermSliderUnavailable = true;
        }
        if (parseInt($('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val()) !==
                Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz * this.sliderGyroFilterMultiplier) ||
            parseInt($('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val()) !==
                Math.floor(this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz * this.sliderGyroFilterMultiplier) ||
            parseInt($('.pid_filter select[name="gyroLowpassDynType"]').val()) !== this.FILTER_DEFAULT.gyro_lowpass_type ||
            parseInt($('.pid_filter input[name="gyroLowpass2Frequency"]').val()) !==
                Math.floor(this.FILTER_DEFAULT.gyro_lowpass2_hz * this.sliderGyroFilterMultiplier) ||
            parseInt($('.pid_filter select[name="gyroLowpass2Type"]').val()) !== this.FILTER_DEFAULT.gyro_lowpass2_type) {
            this.GyroSliderUnavailable = true;
            this.sliderGyroFilter = 0;
        } else {
            this.cachedGyroSliderValues = true;
            this.sliderGyroFilter = 1;
        }

        if (parseInt($('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val()) !==
                Math.floor(this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz * this.sliderDTermFilterMultiplier) ||
                Math.abs(parseInt($('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val()) - this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz * this.sliderDTermFilterMultiplier) > 1 ||
            parseInt($('.pid_filter select[name="dtermLowpassDynType"]').val()) !== this.FILTER_DEFAULT.dterm_lowpass_type ||
            parseInt($('.pid_filter input[name="dtermLowpass2Frequency"]').val()) !==
                Math.floor(this.FILTER_DEFAULT.dterm_lowpass2_hz * this.sliderDTermFilterMultiplier) ||
            parseInt($('.pid_filter select[name="dtermLowpass2Type"]').val()) !== this.FILTER_DEFAULT.dterm_lowpass2_type) {
            this.DTermSliderUnavailable = true;
            this.sliderDTermFilter = 0;
        } else {
            this.cachedDTermSliderValues = true;
            this.sliderDTermFilter = 1;
        }
    } else {
        this.legacyUpdateFilterSlidersDisplay();
    }


    if (this.GyroSliderUnavailable) {
        $('.tuningFilterSliders .sliderLabels tr:nth-child(2)').hide();
    } else {
        $('.tuningFilterSliders .sliderLabels tr:nth-child(2)').show();
    }

    if (this.DTermSliderUnavailable) {
        $('.tuningFilterSliders .sliderLabels tr:last-child').hide();
    } else {
        $('.tuningFilterSliders .sliderLabels tr:last-child').show();
    }

    $('.tuningFilterSliders').toggle(!(this.GyroSliderUnavailable && this.DTermSliderUnavailable));
    $('.subtab-filter .slidersDisabled').toggle(this.GyroSliderUnavailable || this.DTermSliderUnavailable);
    $('.subtab-filter .nonExpertModeSlidersNote').toggle((!this.GyroSliderUnavailable || !this.DTermSliderUnavailable) && !this.expertMode);
    $('.subtab-filter .slidersWarning').toggle(((this.sliderGyroFilterMultiplier >= WARNING_FILTER_HIGH_GAIN ||
                                                    this.sliderGyroFilterMultiplier <= WARNING_FILTER_LOW_GAIN) && !this.GyroSliderUnavailable) ||
                                                    ((this.sliderDTermFilterMultiplier >= WARNING_FILTER_HIGH_GAIN ||
                                                     this.sliderDTermFilterMultiplier <= WARNING_FILTER_LOW_GAIN) && !this.DTermSliderUnavailable));
};

TuningSliders.updateFormPids = function(updateSlidersOnly = false) {
    if (!updateSlidersOnly) {
        FC.PID_NAMES.forEach(function (elementPid, indexPid) {
            const pidElements = $(`.pid_tuning .${elementPid} input`);
            pidElements.each(function (indexInput) {
                if (indexPid < 3 && indexInput < 3) {
                    $(this).val(FC.PIDS[indexPid][indexInput]);
                }
            });
        });

        $('.pid_tuning input[name="dMinRoll"]').val(FC.ADVANCED_TUNING.dMinRoll);
        $('.pid_tuning input[name="dMinPitch"]').val(FC.ADVANCED_TUNING.dMinPitch);
        $('.pid_tuning input[name="dMinYaw"]').val(FC.ADVANCED_TUNING.dMinYaw);
        $('.pid_tuning .ROLL input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardRoll);
        $('.pid_tuning .PITCH input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardPitch);
        $('.pid_tuning .YAW input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardYaw);
    }

    $('output[name="sliderMasterMultiplier-number"]').val(this.sliderMasterMultiplier);
    $('output[name="sliderRollPitchRatio-number"]').val(this.sliderRollPitchRatio);
    $('output[name="sliderIGain-number"]').val(this.sliderIGain);
    $('output[name="sliderPDRatio-number"]').val(this.sliderPDRatio);
    $('output[name="sliderPDGain-number"]').val(this.sliderPDGain);
    $('output[name="sliderDMinRatio-number"]').val(this.sliderDMinRatio);
    $('output[name="sliderFeedforwardGain-number"]').val(this.sliderFeedforwardGain);

};

TuningSliders.legacyCalculatePids = function(updateSlidersOnly = false) {
    const MAX_PID_GAIN = 200;
    const MAX_DMIN_GAIN = 100;
    const MAX_FEEDFORWARD_GAIN = 2000;

    // only used for 4.1 where calculation is not done in firmware
    if (this.dMinFeatureEnabled) {
        //dmin
        FC.ADVANCED_TUNING.dMinRoll = Math.round(this.PID_DEFAULT[3] * this.sliderPDGain * this.sliderPDRatio);
        FC.ADVANCED_TUNING.dMinPitch = Math.round(this.PID_DEFAULT[8] * this.sliderPDGain * this.sliderPDRatio);
        // dmax
        FC.PIDS[0][2] = Math.round(this.PID_DEFAULT[2] * this.sliderPDGain * this.sliderPDRatio);
        FC.PIDS[1][2] = Math.round(this.PID_DEFAULT[7] * this.sliderPDGain * this.sliderPDRatio);
    } else {
        FC.ADVANCED_TUNING.dMinRoll = 0;
        FC.ADVANCED_TUNING.dMinPitch = 0;
        FC.PIDS[0][2] = Math.round((this.PID_DEFAULT[2] * D_MIN_RATIO) * this.sliderPDGain * this.sliderPDRatio);
        FC.PIDS[1][2] = Math.round((this.PID_DEFAULT[7] * D_MIN_RATIO) * this.sliderPDGain * this.sliderPDRatio);
    }

    FC.PIDS[0][0] = Math.round(this.PID_DEFAULT[0] * this.sliderPDGain);
    FC.PIDS[1][0] = Math.round(this.PID_DEFAULT[5] * this.sliderPDGain);
    FC.PIDS[2][0] = Math.round(this.PID_DEFAULT[10] * this.sliderPDGain);
    // feedforward
    FC.ADVANCED_TUNING.feedforwardRoll = Math.round(this.PID_DEFAULT[4] * this.sliderFeedforwardGain);
    FC.ADVANCED_TUNING.feedforwardPitch = Math.round(this.PID_DEFAULT[9] * this.sliderFeedforwardGain);
    FC.ADVANCED_TUNING.feedforwardYaw = Math.round(this.PID_DEFAULT[14] * this.sliderFeedforwardGain);
    // master slider part
    // these are not calculated anywhere other than master slider multiplier therefore set at default before every calculation
    FC.PIDS[0][1] = this.PID_DEFAULT[1];
    FC.PIDS[1][1] = this.PID_DEFAULT[6];
    FC.PIDS[2][1] = this.PID_DEFAULT[11];
    // yaw d, dmin
    FC.PIDS[2][2] = this.PID_DEFAULT[12];
    FC.ADVANCED_TUNING.dMinYaw = this.PID_DEFAULT[13];

    //master slider multiplication, max value 200 for main PID values
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            FC.PIDS[j][i] = Math.min(Math.round(FC.PIDS[j][i] * this.sliderMasterMultiplier), MAX_PID_GAIN);
        }
    }

    FC.ADVANCED_TUNING.feedforwardRoll = Math.min(Math.round(FC.ADVANCED_TUNING.feedforwardRoll * this.sliderMasterMultiplier), MAX_FEEDFORWARD_GAIN);
    FC.ADVANCED_TUNING.feedforwardPitch = Math.min(Math.round(FC.ADVANCED_TUNING.feedforwardPitch * this.sliderMasterMultiplier), MAX_FEEDFORWARD_GAIN);
    FC.ADVANCED_TUNING.feedforwardYaw = Math.min(Math.round(FC.ADVANCED_TUNING.feedforwardYaw * this.sliderMasterMultiplier), MAX_FEEDFORWARD_GAIN);

    if (this.dMinFeatureEnabled) {
        FC.ADVANCED_TUNING.dMinRoll = Math.min(Math.round(FC.ADVANCED_TUNING.dMinRoll * this.sliderMasterMultiplier), MAX_DMIN_GAIN);
        FC.ADVANCED_TUNING.dMinPitch = Math.min(Math.round(FC.ADVANCED_TUNING.dMinPitch * this.sliderMasterMultiplier), MAX_DMIN_GAIN);
        FC.ADVANCED_TUNING.dMinYaw = Math.min(Math.round(FC.ADVANCED_TUNING.dMinYaw * this.sliderMasterMultiplier), MAX_DMIN_GAIN);
    }

    this.updateFormPids(updateSlidersOnly);
    TABS.pid_tuning.updatePIDColors();

};

TuningSliders.calculateNewPids = function(updateSlidersOnly = false) {
    // this is the main calculation for PID sliders, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        this.legacyCalculatePids(updateSlidersOnly);
    }

    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        FC.TUNING_SLIDERS.slider_pids_mode = parseInt($('#sliderPidsModeSelect').val());
        //rounds slider values to nearies multiple of 5 and passes to the FW. Avoid dividing calc by (* x 100)/5 = 20
        FC.TUNING_SLIDERS.slider_master_multiplier = Math.round(this.sliderMasterMultiplier * 20) * 5;
        FC.TUNING_SLIDERS.slider_roll_pitch_ratio = Math.round(this.sliderRollPitchRatio * 20) * 5;
        FC.TUNING_SLIDERS.slider_i_gain = Math.round(this.sliderIGain * 20) * 5;
        FC.TUNING_SLIDERS.slider_pd_ratio = Math.round(this.sliderPDRatio * 20) * 5;
        FC.TUNING_SLIDERS.slider_pd_gain = Math.round(this.sliderPDGain * 20) * 5;
        FC.TUNING_SLIDERS.slider_dmin_ratio = Math.round(this.sliderDMinRatio * 20) * 5;
        FC.TUNING_SLIDERS.slider_feedforward_gain = Math.round(this.sliderFeedforwardGain * 20) * 5;

        MSP.promise(MSPCodes.MSP_SET_TUNING_SLIDERS, mspHelper.crunch(MSPCodes.MSP_SET_TUNING_SLIDERS))
        .then(() => MSP.promise(MSPCodes.MSP_PID))
        .then(() => MSP.promise(MSPCodes.MSP_PID_ADVANCED))
        .then(() => {
            this.updateFormPids(updateSlidersOnly);
            TABS.pid_tuning.updatePIDColors();
        });
    }
};

TuningSliders.calculateLegacyGyroFilters = function() {
    // calculate, set and display new values in forms based on slider position
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = Math.floor(this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz * this.sliderGyroFilterMultiplier);
    FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = Math.floor(this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz * this.sliderGyroFilterMultiplier);
    FC.FILTER_CONFIG.gyro_lowpass2_hz = Math.floor(this.FILTER_DEFAULT.gyro_lowpass2_hz * this.sliderGyroFilterMultiplier);
    FC.FILTER_CONFIG.gyro_lowpass_type = this.FILTER_DEFAULT.gyro_lowpass_type;
    FC.FILTER_CONFIG.gyro_lowpass2_type = this.FILTER_DEFAULT.gyro_lowpass2_type;

    this.updateLowpassValues();
};

TuningSliders.calculateLegacyDTermFilters = function() {
    // calculate, set and display new values in forms based on slider position
    FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz * this.sliderDTermFilterMultiplier);
    FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz * this.sliderDTermFilterMultiplier);
    FC.FILTER_CONFIG.dterm_lowpass2_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass2_hz * this.sliderDTermFilterMultiplier);
    FC.FILTER_CONFIG.dterm_lowpass_type = this.FILTER_DEFAULT.dterm_lowpass_type;
    FC.FILTER_CONFIG.dterm_lowpass2_type = this.FILTER_DEFAULT.dterm_lowpass2_type;

    this.updateLowpassValues();
};

TuningSliders.calculateNewGyroFilters = function() {
    // this is the main calculation for Gyro Filter slider, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        FC.TUNING_SLIDERS.slider_gyro_filter = this.sliderGyroFilter;
        //rounds slider values to nearies multiple of 5 and passes to the FW. Avoid dividing calc by (* x 100)/5 = 20
        FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = Math.round(this.sliderGyroFilterMultiplier * 20) * 5;
        this.writeFilterSliders();
    } else {
        this.calculateLegacyGyroFilters();
    }
};

TuningSliders.calculateNewDTermFilters = function() {
    // this is the main calculation for Gyro Filter slider, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_44)) {
        FC.TUNING_SLIDERS.slider_dterm_filter = this.sliderDTermFilter;
        //rounds slider values to nearies multiple of 5 and passes to the FW. Avoid divide by ROUND[(* x 100)/5 = 20]
        FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = Math.round(this.sliderDTermFilterMultiplier * 20) * 5;
        this.writeFilterSliders();
    } else {
        this.calculateLegacyDTermFilters();
    }
};

TuningSliders.writeFilterSliders = function () {
    MSP.promise(MSPCodes.MSP_SET_TUNING_SLIDERS, mspHelper.crunch(MSPCodes.MSP_SET_TUNING_SLIDERS))
    .then(() => MSP.promise(MSPCodes.MSP_EEPROM_WRITE))
    .then(() => MSP.promise(MSPCodes.MSP_FILTER_CONFIG))
    .then(() => {
        TuningSliders.updateLowpassValues();
        if (this.FilterReset) {
            this.FilterReset = false;
            this.updateFilterSlidersDisplay();
        }
    });
};

TuningSliders.updateLowpassValues = function() {
    $('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz);
    $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz);
    $('.pid_filter input[name="gyroLowpass2Frequency"]').val(FC.FILTER_CONFIG.gyro_lowpass2_hz);
    $('.pid_filter select[name="gyroLowpassDynType]"').val(FC.FILTER_CONFIG.gyro_lowpass_type);
    $('.pid_filter select[name="gyroLowpass2Type"]').val(FC.FILTER_CONFIG.gyro_lowpass2_type);
    $('output[name="sliderGyroFilterMultiplier-number"]').val(this.sliderGyroFilterMultiplier);

    $('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz);
    $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz);
    $('.pid_filter input[name="dtermLowpass2Frequency"]').val(FC.FILTER_CONFIG.dterm_lowpass2_hz);
    $('.pid_filter select[name="dtermLowpassDynType"]').val(FC.FILTER_CONFIG.dterm_lowpass_type);
    $('.pid_filter select[name="dtermLowpass2Type"]').val(FC.FILTER_CONFIG.dterm_lowpass2_type);
    $('output[name="sliderDTermFilterMultiplier-number"]').val(this.sliderDTermFilterMultiplier);
};
