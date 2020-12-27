'use strict';

const TuningSliders = {
    MasterSliderValue: 1,
    PDRatioSliderValue: 1,
    PDGainSliderValue: 1,
    ResponseSliderValue: 1,
    pidSlidersUnavailable: false,

    gyroFilterSliderValue: 1,
    dtermFilterSliderValue: 1,
    filterGyroSliderUnavailable: false,
    filterDTermSliderUnavailable: false,

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

TuningSliders.initialize = function() {
    this.PID_DEFAULT = FC.getPidDefaults();
    this.FILTER_DEFAULT = FC.getFilterDefaults();

    this.setDMinFeatureEnabled($('#dMinSwitch').is(':checked'));
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

TuningSliders.setDMinFeatureEnabled = function(dMinFeatureEnabled) {
    this.dMinFeatureEnabled = dMinFeatureEnabled;
    if (this.dMinFeatureEnabled) {
        this.defaultPDRatio = this.PID_DEFAULT[2] / this.PID_DEFAULT[0];
    } else {
        this.defaultPDRatio = this.PID_DEFAULT[2] / (this.PID_DEFAULT[0] * (1 / D_MIN_RATIO));
    }
};

TuningSliders.setExpertMode = function(expertMode) {
    this.expertMode = expertMode;
    const allTuningSliderElements = $('#tuningMasterSlider, #tuningPDRatioSlider, #tuningPDGainSlider,\
                                    #tuningResponseSlider, #tuningGyroFilterSlider, #tuningDTermFilterSlider');
    if (this.expertMode) {
        allTuningSliderElements.removeClass('nonExpertModeSliders');
    } else {
        allTuningSliderElements.addClass('nonExpertModeSliders');
    }
};

TuningSliders.scaleSliderValue = function(value) {
    if (value > 1) {
        return Math.round(((value - 1) * 2 + 1) * 10) / 10;
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
    // used to estimate PID slider positions based on PIDF values, and set respective slider position
    // provides only an estimation due to limitation of feature without firmware support, to be improved in later versions
    this.MasterSliderValue = Math.round(FC.PIDS[2][1] / this.PID_DEFAULT[11] * 10) / 10;
    this.PDRatioSliderValue = Math.round(FC.PIDS[0][2] / FC.PIDS[0][0] / this.defaultPDRatio * 10) / 10;
    if (this.dMinFeatureEnabled) {
        this.PDGainSliderValue = Math.round(FC.ADVANCED_TUNING.dMinRoll / this.PDRatioSliderValue / this.MasterSliderValue / this.PID_DEFAULT[3] * 10) / 10;
    } else {
        this.PDGainSliderValue = Math.round(FC.PIDS[0][0] / this.MasterSliderValue / (this.PID_DEFAULT[2] * (1 / D_MIN_RATIO)) * 10) / 10;
    }
    this.ResponseSliderValue = Math.round(FC.ADVANCED_TUNING.feedforwardRoll / this.MasterSliderValue / this.PID_DEFAULT[4] * 10) / 10;

    $('output[name="tuningMasterSlider-number"]').val(this.MasterSliderValue);
    $('output[name="tuningPDRatioSlider-number"]').val(this.PDRatioSliderValue);
    $('output[name="tuningPDGainSlider-number"]').val(this.PDGainSliderValue);
    $('output[name="tuningResponseSlider-number"]').val(this.ResponseSliderValue);

    $('#tuningMasterSlider').val(this.downscaleSliderValue(this.MasterSliderValue));
    $('#tuningPDRatioSlider').val(this.downscaleSliderValue(this.PDRatioSliderValue));
    $('#tuningPDGainSlider').val(this.downscaleSliderValue(this.PDGainSliderValue));
    $('#tuningResponseSlider').val(this.downscaleSliderValue(this.ResponseSliderValue));
};

TuningSliders.initGyroFilterSliderPosition = function() {
    this.gyroFilterSliderValue = Math.round((FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz + FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz + FC.FILTER_CONFIG.gyro_lowpass2_hz) /
                                (this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz + this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz + this.FILTER_DEFAULT.gyro_lowpass2_hz) * 100) / 100;
    $('output[name="tuningGyroFilterSlider-number"]').val(this.gyroFilterSliderValue);
    $('#tuningGyroFilterSlider').val(this.downscaleSliderValue(this.gyroFilterSliderValue));
};

TuningSliders.initDTermFilterSliderPosition = function() {
    this.dtermFilterSliderValue = Math.round((FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz + FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz + FC.FILTER_CONFIG.dterm_lowpass2_hz) /
                                (this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz + this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz + this.FILTER_DEFAULT.dterm_lowpass2_hz) * 100) / 100;
    $('output[name="tuningDTermFilterSlider-number"]').val(this.dtermFilterSliderValue);
    $('#tuningDTermFilterSlider').val(this.downscaleSliderValue(this.dtermFilterSliderValue));
};

TuningSliders.resetPidSliders = function() {
    if (!this.cachedPidSliderValues) {
        $('#tuningMasterSlider').val(1);
        $('#tuningPDRatioSlider').val(1);
        $('#tuningPDGainSlider').val(1);
        $('#tuningResponseSlider').val(1);
        this.MasterSliderValue = 1;
        this.PDRatioSliderValue = 1;
        this.PDGainSliderValue = 1;
        this.ResponseSliderValue = 1;
    }
    this.calculateNewPids();
    this.updatePidSlidersDisplay();
};

TuningSliders.resetGyroFilterSlider = function() {
    if (!this.cachedGyroSliderValues) {
        $('#tuningGyroFilterSlider').val(1);
        this.gyroFilterSliderValue = 1;
    }
    this.calculateNewGyroFilters();
    this.updateFilterSlidersDisplay();
};

TuningSliders.resetDTermFilterSlider = function() {
    if (!this.cachedDTermSliderValues) {
        $('#tuningDTermFilterSlider').val(1);
        this.dtermFilterSliderValue = 1;
    }
    this.calculateNewDTermFilters();
    this.updateFilterSlidersDisplay();
};

TuningSliders.updatePidSlidersDisplay = function() {
    // check if pid values changed manually by saving current values, doing the slider based calculation, and comaparing
    // if values before and after calculation, if all of them are equal the values haven't been changed manually
    const WARNING_P_GAIN = 70;
    const WARNING_I_GAIN = 120;
    const WARNING_DMAX_GAIN = 60;
    const WARNING_DMIN_GAIN = 40;

    this.pidSlidersUnavailable = false;
    let currentPIDs = [];
    FC.PID_NAMES.forEach(function(elementPid, indexPid) {
        let searchRow = $('.pid_tuning .' + elementPid + ' input');
        searchRow.each(function (indexInput) {
            if (indexPid < 3 && indexInput < 5) {
                currentPIDs.push($(this).val());
            }
        });
    });
    this.calculateNewPids();
    FC.PID_NAMES.forEach(function(elementPid, indexPid) {
        let searchRow = $('.pid_tuning .' + elementPid + ' input');
        searchRow.each(function (indexInput) {
            if (indexPid < 3 && indexInput < 5) {
                if (currentPIDs[indexPid * 5 + indexInput] != $(this).val()) {
                    TuningSliders.pidSlidersUnavailable = true;
                }
                $(this).val(currentPIDs[indexPid * 5 + indexInput]);
            }
        });
    });

    if ($('input[id="useIntegratedYaw"]').is(':checked')) {
        this.pidSlidersUnavailable = true;
    }

    if (this.pidSlidersUnavailable) {
        TABS.pid_tuning.updatePIDColors(true);
    } else {
        this.cachedPidSliderValues = true;
    }

    $('.tuningPIDSliders').toggle(!this.pidSlidersUnavailable);
    $('.subtab-pid .slidersDisabled').toggle(this.pidSlidersUnavailable);
    $('.subtab-pid .nonExpertModeSlidersNote').toggle(!this.pidSlidersUnavailable && !this.expertMode);
    $('.subtab-pid .slidersWarning').toggle((FC.PIDS[1][0] > WARNING_P_GAIN || FC.PIDS[1][1] > WARNING_I_GAIN || FC.PIDS[1][2] > WARNING_DMAX_GAIN ||
                                                FC.ADVANCED_TUNING.dMinPitch > WARNING_DMIN_GAIN) && !this.pidSlidersUnavailable);
};

TuningSliders.updateFilterSlidersDisplay = function() {
    // check if filters changed manually by comapring current value and those based on slider position
    const WARNING_FILTER_HIGH_GAIN = 1.4;
    const WARNING_FILTER_LOW_GAIN = 0.7;

    this.filterGyroSliderUnavailable = false;
    this.filterDTermSliderUnavailable = false;

    if (parseInt($('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val(), 10) !== Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz * this.gyroFilterSliderValue) ||
        parseInt($('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val(), 10) !== Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz * this.gyroFilterSliderValue) ||
        parseInt($('.pid_filter select[name="gyroLowpassDynType"]').val(), 10) !== this.FILTER_DEFAULT.gyro_lowpass_type ||
        parseInt($('.pid_filter input[name="gyroLowpass2Frequency"]').val(), 10) !== Math.round(this.FILTER_DEFAULT.gyro_lowpass2_hz * this.gyroFilterSliderValue) ||
        parseInt($('.pid_filter select[name="gyroLowpass2Type"]').val(), 10) !== this.FILTER_DEFAULT.gyro_lowpass2_type) {

        $('.tuningFilterSliders .sliderLabels tr:nth-child(2)').hide();
        this.filterGyroSliderUnavailable = true;
    } else {
        $('.tuningFilterSliders .sliderLabels tr:nth-child(2)').show()
        this.cachedGyroSliderValues = true;
    }

    if (parseInt($('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val(), 10) !== Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz * this.dtermFilterSliderValue) ||
        parseInt($('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val(), 10) !== Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz * this.dtermFilterSliderValue) ||
        parseInt($('.pid_filter select[name="dtermLowpassDynType"]').val(), 10) !== this.FILTER_DEFAULT.dterm_lowpass_type ||
        parseInt($('.pid_filter input[name="dtermLowpass2Frequency"]').val(), 10) !== Math.round(this.FILTER_DEFAULT.dterm_lowpass2_hz * this.dtermFilterSliderValue) ||
        parseInt($('.pid_filter select[name="dtermLowpass2Type"]').val(), 10) !== this.FILTER_DEFAULT.dterm_lowpass2_type) {

        $('.tuningFilterSliders .sliderLabels tr:last-child').hide();
        this.filterDTermSliderUnavailable = true;
    } else {
        $('.tuningFilterSliders .sliderLabels tr:last-child').show();
        this.cachedDTermSliderValues = true;
    }

    $('.tuningFilterSliders').toggle(!(this.filterGyroSliderUnavailable && this.filterDTermSliderUnavailable));
    $('.subtab-filter .slidersDisabled').toggle(this.filterGyroSliderUnavailable || this.filterDTermSliderUnavailable);
    $('.subtab-filter .nonExpertModeSlidersNote').toggle((!this.filterGyroSliderUnavailable || !this.filterDTermSliderUnavailable) && !this.expertMode);
    $('.subtab-filter .slidersWarning').toggle(((this.gyroFilterSliderValue >= WARNING_FILTER_HIGH_GAIN ||
                                                    this.gyroFilterSliderValue <= WARNING_FILTER_LOW_GAIN) && !this.filterGyroSliderUnavailable) ||
                                                    ((this.dtermFilterSliderValue >= WARNING_FILTER_HIGH_GAIN ||
                                                     this.dtermFilterSliderValue <= WARNING_FILTER_LOW_GAIN) && !this.filterDTermSliderUnavailable));
};

TuningSliders.calculateNewPids = function() {
    // this is the main calculation for PID sliders, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    const MAX_PID_GAIN = 200;
    const MAX_DMIN_GAIN = 100;
    const MAX_FF_GAIN = 2000;

    if (this.dMinFeatureEnabled) {
        //dmin
        FC.ADVANCED_TUNING.dMinRoll = Math.round(this.PID_DEFAULT[3] * this.PDGainSliderValue * this.PDRatioSliderValue);
        FC.ADVANCED_TUNING.dMinPitch = Math.round(this.PID_DEFAULT[8] * this.PDGainSliderValue * this.PDRatioSliderValue);
        // dmax
        FC.PIDS[0][2] = Math.round(this.PID_DEFAULT[2] * this.PDGainSliderValue * this.PDRatioSliderValue);
        FC.PIDS[1][2] = Math.round(this.PID_DEFAULT[7] * this.PDGainSliderValue * this.PDRatioSliderValue);
    } else {
        FC.ADVANCED_TUNING.dMinRoll = 0;
        FC.ADVANCED_TUNING.dMinPitch = 0;
        FC.PIDS[0][2] = Math.round((this.PID_DEFAULT[2] * D_MIN_RATIO) * this.PDGainSliderValue * this.PDRatioSliderValue);
        FC.PIDS[1][2] = Math.round((this.PID_DEFAULT[7] * D_MIN_RATIO) * this.PDGainSliderValue * this.PDRatioSliderValue);
    }
    // p
    FC.PIDS[0][0] = Math.round(this.PID_DEFAULT[0] * this.PDGainSliderValue);
    FC.PIDS[1][0] = Math.round(this.PID_DEFAULT[5] * this.PDGainSliderValue);
    FC.PIDS[2][0] = Math.round(this.PID_DEFAULT[10] * this.PDGainSliderValue);
    // ff
    FC.ADVANCED_TUNING.feedforwardRoll = Math.round(this.PID_DEFAULT[4] * this.ResponseSliderValue);
    FC.ADVANCED_TUNING.feedforwardPitch = Math.round(this.PID_DEFAULT[9] * this.ResponseSliderValue);
    FC.ADVANCED_TUNING.feedforwardYaw = Math.round(this.PID_DEFAULT[14] * this.ResponseSliderValue);

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
            FC.PIDS[j][i] = Math.min(Math.round(FC.PIDS[j][i] * this.MasterSliderValue), MAX_PID_GAIN);
        }
    }
    FC.ADVANCED_TUNING.feedforwardRoll = Math.min(Math.round(FC.ADVANCED_TUNING.feedforwardRoll * this.MasterSliderValue), MAX_FF_GAIN);
    FC.ADVANCED_TUNING.feedforwardPitch = Math.min(Math.round(FC.ADVANCED_TUNING.feedforwardPitch * this.MasterSliderValue), MAX_FF_GAIN);
    FC.ADVANCED_TUNING.feedforwardYaw = Math.min(Math.round(FC.ADVANCED_TUNING.feedforwardYaw * this.MasterSliderValue), MAX_FF_GAIN);
    if (this.dMinFeatureEnabled) {
        FC.ADVANCED_TUNING.dMinRoll = Math.min(Math.round(FC.ADVANCED_TUNING.dMinRoll * this.MasterSliderValue), MAX_DMIN_GAIN);
        FC.ADVANCED_TUNING.dMinPitch = Math.min(Math.round(FC.ADVANCED_TUNING.dMinPitch * this.MasterSliderValue), MAX_DMIN_GAIN);
        FC.ADVANCED_TUNING.dMinYaw = Math.min(Math.round(FC.ADVANCED_TUNING.dMinYaw * this.MasterSliderValue), MAX_DMIN_GAIN);
    }

    $('output[name="tuningMasterSlider-number"]').val(this.MasterSliderValue);
    $('output[name="tuningPDRatioSlider-number"]').val(this.PDRatioSliderValue);
    $('output[name="tuningPDGainSlider-number"]').val(this.PDGainSliderValue);
    $('output[name="tuningResponseSlider-number"]').val(this.ResponseSliderValue);

    // updates values in forms
    FC.PID_NAMES.forEach(function(elementPid, indexPid) {
        let searchRow = $('.pid_tuning .' + elementPid + ' input');
        searchRow.each(function (indexInput) {
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

    TABS.pid_tuning.updatePIDColors();
};

TuningSliders.calculateNewGyroFilters = function() {
    // calculate, set and display new values in forms based on slider position
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz * this.gyroFilterSliderValue);
    FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz = Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz * this.gyroFilterSliderValue);
    FC.FILTER_CONFIG.gyro_lowpass2_hz = Math.round(this.FILTER_DEFAULT.gyro_lowpass2_hz * this.gyroFilterSliderValue);
    FC.FILTER_CONFIG.gyro_lowpass_type = this.FILTER_DEFAULT.gyro_lowpass_type;
    FC.FILTER_CONFIG.gyro_lowpass2_type = this.FILTER_DEFAULT.gyro_lowpass2_type;

    $('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz);
    $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz);
    $('.pid_filter input[name="gyroLowpass2Frequency"]').val(FC.FILTER_CONFIG.gyro_lowpass2_hz);
    $('.pid_filter select[name="gyroLowpassDynType').val(FC.FILTER_CONFIG.gyro_lowpass_type);
    $('.pid_filter select[name="gyroLowpass2Type').val(FC.FILTER_CONFIG.gyro_lowpass2_type);
    $('output[name="tuningGyroFilterSlider-number"]').val(this.gyroFilterSliderValue);
};

TuningSliders.calculateNewDTermFilters = function() {
    // calculate, set and display new values in forms based on slider position
    FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz * this.dtermFilterSliderValue);
    FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz * this.dtermFilterSliderValue);
    FC.FILTER_CONFIG.dterm_lowpass2_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass2_hz * this.dtermFilterSliderValue);
    FC.FILTER_CONFIG.dterm_lowpass_type = this.FILTER_DEFAULT.dterm_lowpass_type;
    FC.FILTER_CONFIG.dterm_lowpass2_type = this.FILTER_DEFAULT.dterm_lowpass2_type;

    $('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz);
    $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz);
    $('.pid_filter input[name="dtermLowpass2Frequency"]').val(FC.FILTER_CONFIG.dterm_lowpass2_hz);
    $('.pid_filter select[name="dtermLowpassDynType').val(FC.FILTER_CONFIG.dterm_lowpass_type);
    $('.pid_filter select[name="dtermLowpass2Type').val(FC.FILTER_CONFIG.dterm_lowpass2_type);
    $('output[name="tuningDTermFilterSlider-number"]').val(this.dtermFilterSliderValue);
};
