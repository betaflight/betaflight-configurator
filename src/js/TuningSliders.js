'use strict';

var TuningSliders = {
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
};

TuningSliders.initialize = function() {
    this.PID_DEFAULT = FC.getPidDefaults();
    this.FILTER_DEFAULT = FC.getFilterDefaults();

    this.setDMinFeatureEnabled($('#dMinSwitch').is(':checked'));

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
        this.defaultPDRatio = this.PID_DEFAULT[0] / this.PID_DEFAULT[2];
    } else {
        this.defaultPDRatio = this.PID_DEFAULT[0] / this.PID_DEFAULT[3];
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
    this.MasterSliderValue = Math.round(PIDs[2][0] / this.PID_DEFAULT[10] * 10) / 10;
    this.PDRatioSliderValue = Math.round(PIDs[0][0] / PIDs[0][2] / this.defaultPDRatio * 10) / 10;
    if (this.dMinFeatureEnabled) {
        this.PDGainSliderValue = Math.round(ADVANCED_TUNING.dMinRoll / this.MasterSliderValue / this.PID_DEFAULT[3] * 10) / 10;
    } else {
        this.PDGainSliderValue = Math.round(PIDs[0][2] / this.MasterSliderValue / this.PID_DEFAULT[3] * 10) / 10;
    }
    this.ResponseSliderValue = Math.round(ADVANCED_TUNING.feedforwardRoll / this.MasterSliderValue / this.PID_DEFAULT[4] * 10) / 10;

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
    this.gyroFilterSliderValue = Math.round((FILTER_CONFIG.gyro_lowpass_dyn_min_hz + FILTER_CONFIG.gyro_lowpass2_hz) / 
                                (this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz + this.FILTER_DEFAULT.gyro_lowpass2_hz) * 100) / 100;
    $('output[name="tuningGyroFilterSlider-number"]').val(this.gyroFilterSliderValue);
    $('#tuningGyroFilterSlider').val(this.downscaleSliderValue(this.gyroFilterSliderValue));
};

TuningSliders.initDTermFilterSliderPosition = function() {
    this.dtermFilterSliderValue = Math.round((FILTER_CONFIG.dterm_lowpass_dyn_min_hz + FILTER_CONFIG.dterm_lowpass_dyn_max_hz + FILTER_CONFIG.dterm_lowpass2_hz) / 
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
    // and the sliders are shown, otherwise sliders are grayed out and centered
    const WARNING_P_GAIN = 110;
    const WARNING_I_GAIN = 120;
    const WARNING_DMAX_GAIN = 70;
    const WARNING_DMIN_GAIN = 40;

    this.pidSlidersUnavailable = false;
    let currentPIDs = [];
    PID_names.forEach(function(elementPid, indexPid) {
        let searchRow = $('.pid_tuning .' + elementPid + ' input');
        searchRow.each(function (indexInput) {
            if (indexPid < 3 && indexInput < 5) {
                currentPIDs.push($(this).val());
            }
        });
    });
    this.calculateNewPids();
    PID_names.forEach(function(elementPid, indexPid) {
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
        $('.tuningPIDSliders').hide();
        $('.slidersDisabled').show();
    } else {
        $('.tuningPIDSliders').show();
        $('.slidersDisabled').hide();
        this.cachedPidSliderValues = true;
    }

    if ((PIDs[1][0] > WARNING_P_GAIN || PIDs[1][1] > WARNING_I_GAIN || PIDs[1][2] > WARNING_DMAX_GAIN || ADVANCED_TUNING.dMinPitch > WARNING_DMIN_GAIN) && !this.pidSlidersUnavailable) {
        $('.slidersHighWarning').show();
    } else {
        $('.slidersHighWarning').hide();
    }
};

TuningSliders.updateFilterSlidersDisplay = function() {
    // check if filters changed manually by comapring current value and those based on slider position
    // if equal filter slider is shown, otherwise it is grayed out and centered
    const WARNING_FILTER_GAIN = 1.4;

    this.filterGyroSliderUnavailable = false;
    this.filterDTermSliderUnavailable = false;

    if ($('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val() != Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz * this.gyroFilterSliderValue) ||
        $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val() != Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz * this.gyroFilterSliderValue) ||
        $('.pid_filter select[name="gyroLowpassDynType"]').val() != this.FILTER_DEFAULT.gyro_lowpass_type ||
        $('.pid_filter input[name="gyroLowpass2Frequency"]').val() != Math.round(this.FILTER_DEFAULT.gyro_lowpass2_hz * this.gyroFilterSliderValue) ||
        $('.pid_filter select[name="gyroLowpass2Type"]').val() != this.FILTER_DEFAULT.gyro_lowpass2_type) {

        $('.tuningFilterSliders .sliderLabels tr:first-child').hide();
        this.filterGyroSliderUnavailable = true;
    } else {
        $('.tuningFilterSliders .sliderLabels tr:first-child').show()
        this.cachedGyroSliderValues = true;
    }

    if ($('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val() != Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz * this.dtermFilterSliderValue) ||
        $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val() != Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz * this.dtermFilterSliderValue) ||
        $('.pid_filter select[name="dtermLowpassDynType"]').val() != this.FILTER_DEFAULT.dterm_lowpass_type ||
        $('.pid_filter input[name="dtermLowpass2Frequency"]').val() != Math.round(this.FILTER_DEFAULT.dterm_lowpass2_hz * this.dtermFilterSliderValue) ||
        $('.pid_filter select[name="dtermLowpass2Type"]').val() != this.FILTER_DEFAULT.dterm_lowpass2_type) {

        $('.tuningFilterSliders .sliderLabels tr:last-child').hide();
        this.filterDTermSliderUnavailable = true;
    } else {
        $('.tuningFilterSliders .sliderLabels tr:last-child').show();
        this.cachedDTermSliderValues = true;
    }

    if (this.filterGyroSliderUnavailable && this.filterDTermSliderUnavailable) {
        $('.tuningFilterSliders').hide();
    } else {
        $('.tuningFilterSliders').show();
    }
    if (this.filterGyroSliderUnavailable || this.filterDTermSliderUnavailable) {
        $('.slidersFilterDisabled').show();
    } else {
        $('.slidersFilterDisabled').hide();
    }

    if ((this.gyroFilterSliderValue >= WARNING_FILTER_GAIN && !this.filterGyroSliderUnavailable) || (this.dtermFilterSliderValue >= WARNING_FILTER_GAIN && !this.filterDTermSliderUnavailable)) {
        $('.slidersFilterHighWarning').show();
    } else {
        $('.slidersFilterHighWarning').hide();
    }
};

TuningSliders.calculateNewPids = function() {
    // this is the main calculation for PID sliders, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    if (this.dMinFeatureEnabled) {
        //dmin
        ADVANCED_TUNING.dMinRoll = Math.round(this.PID_DEFAULT[3] * this.PDGainSliderValue);
        ADVANCED_TUNING.dMinPitch = Math.round(this.PID_DEFAULT[8] * this.PDGainSliderValue);
        // dmax
        PIDs[0][2] = Math.round(this.PID_DEFAULT[2] * this.PDGainSliderValue);
        PIDs[1][2] = Math.round(this.PID_DEFAULT[7] * this.PDGainSliderValue);
    } else {
        ADVANCED_TUNING.dMinRoll = 0;
        ADVANCED_TUNING.dMinPitch = 0;
        PIDs[0][2] = Math.round(this.PID_DEFAULT[3] * this.PDGainSliderValue);
        PIDs[1][2] = Math.round(this.PID_DEFAULT[8] * this.PDGainSliderValue);
    }
    // p
    PIDs[0][0] = Math.round(PIDs[0][2] * this.defaultPDRatio * this.PDRatioSliderValue);
    PIDs[1][0] = Math.round(PIDs[1][2] * this.defaultPDRatio * this.PDRatioSliderValue);
    // ff
    ADVANCED_TUNING.feedforwardRoll = Math.round(this.PID_DEFAULT[4] * this.ResponseSliderValue);
    ADVANCED_TUNING.feedforwardPitch = Math.round(this.PID_DEFAULT[9] * this.ResponseSliderValue);
    ADVANCED_TUNING.feedforwardYaw = Math.round(this.PID_DEFAULT[14] * ((this.ResponseSliderValue - 1) / 3 + 1));

    // master slider part
    // these are not calculated anywhere other than master slider multiplier therefore set at default before every calculation
    PIDs[0][1] = this.PID_DEFAULT[1];
    PIDs[1][1] = this.PID_DEFAULT[6];
    PIDs[2][1] = this.PID_DEFAULT[11];
    // yaw p,d, dmin
    PIDs[2][0] = this.PID_DEFAULT[10];
    PIDs[2][2] = this.PID_DEFAULT[12];
    ADVANCED_TUNING.dMinYaw = this.PID_DEFAULT[13];

    //master slider multiplication, max value 200 for main PID values
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            PIDs[j][i] = Math.min(Math.round(PIDs[j][i] * this.MasterSliderValue), 200);
        }
    }
    ADVANCED_TUNING.feedforwardRoll = Math.round(ADVANCED_TUNING.feedforwardRoll * this.MasterSliderValue);
    ADVANCED_TUNING.feedforwardPitch = Math.round(ADVANCED_TUNING.feedforwardPitch * this.MasterSliderValue);
    ADVANCED_TUNING.feedforwardYaw = Math.round(ADVANCED_TUNING.feedforwardYaw * this.MasterSliderValue);
    if (this.dMinFeatureEnabled) {
        ADVANCED_TUNING.dMinRoll = Math.round(ADVANCED_TUNING.dMinRoll * this.MasterSliderValue);
        ADVANCED_TUNING.dMinPitch = Math.round(ADVANCED_TUNING.dMinPitch * this.MasterSliderValue);
        ADVANCED_TUNING.dMinYaw = Math.round(ADVANCED_TUNING.dMinYaw * this.MasterSliderValue);
    }

    $('output[name="tuningMasterSlider-number"]').val(this.MasterSliderValue);
    $('output[name="tuningPDRatioSlider-number"]').val(this.PDRatioSliderValue);
    $('output[name="tuningPDGainSlider-number"]').val(this.PDGainSliderValue);
    $('output[name="tuningResponseSlider-number"]').val(this.ResponseSliderValue);

    // updates values in forms
    PID_names.forEach(function(elementPid, indexPid) {
        let searchRow = $('.pid_tuning .' + elementPid + ' input');
        searchRow.each(function (indexInput) {
            if (indexPid < 3) {
                $(this).val(PIDs[indexPid][indexInput]);
            }
        });
    });
    $('.pid_tuning input[name="dMinRoll"]').val(ADVANCED_TUNING.dMinRoll);
    $('.pid_tuning input[name="dMinPitch"]').val(ADVANCED_TUNING.dMinPitch);
    $('.pid_tuning input[name="dMinYaw"]').val(ADVANCED_TUNING.dMinYaw);
    $('.pid_tuning .ROLL input[name="f"]').val(ADVANCED_TUNING.feedforwardRoll);
    $('.pid_tuning .PITCH input[name="f"]').val(ADVANCED_TUNING.feedforwardPitch);
    $('.pid_tuning .YAW input[name="f"]').val(ADVANCED_TUNING.feedforwardYaw);
};

TuningSliders.calculateNewGyroFilters = function() {
    // calculate, set and display new values in forms based on slider position
    FILTER_CONFIG.gyro_lowpass_dyn_min_hz = Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_min_hz * this.gyroFilterSliderValue);
    FILTER_CONFIG.gyro_lowpass_dyn_max_hz = Math.round(this.FILTER_DEFAULT.gyro_lowpass_dyn_max_hz * this.gyroFilterSliderValue);
    FILTER_CONFIG.gyro_lowpass2_hz = Math.round(this.FILTER_DEFAULT.gyro_lowpass2_hz * this.gyroFilterSliderValue);
    FILTER_CONFIG.gyro_lowpass_type = this.FILTER_DEFAULT.gyro_lowpass_type;
    FILTER_CONFIG.gyro_lowpass2_type = this.FILTER_DEFAULT.gyro_lowpass2_type;

    $('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val(FILTER_CONFIG.gyro_lowpass_dyn_min_hz);
    $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]').val(FILTER_CONFIG.gyro_lowpass_dyn_max_hz);
    $('.pid_filter input[name="gyroLowpass2Frequency"]').val(FILTER_CONFIG.gyro_lowpass2_hz);
    $('.pid_filter select[name="gyroLowpassDynType').val(FILTER_CONFIG.gyro_lowpass_type);
    $('.pid_filter select[name="gyroLowpass2Type').val(FILTER_CONFIG.gyro_lowpass2_type);
    $('output[name="tuningGyroFilterSlider-number"]').val(this.gyroFilterSliderValue);
};

TuningSliders.calculateNewDTermFilters = function() {
    // calculate, set and display new values in forms based on slider position
    FILTER_CONFIG.dterm_lowpass_dyn_min_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_min_hz * this.dtermFilterSliderValue);
    FILTER_CONFIG.dterm_lowpass_dyn_max_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass_dyn_max_hz * this.dtermFilterSliderValue);
    FILTER_CONFIG.dterm_lowpass2_hz = Math.round(this.FILTER_DEFAULT.dterm_lowpass2_hz * this.dtermFilterSliderValue);
    FILTER_CONFIG.dterm_lowpass_type = this.FILTER_DEFAULT.dterm_lowpass_type;
    FILTER_CONFIG.dterm_lowpass2_type = this.FILTER_DEFAULT.dterm_lowpass2_type;

    $('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val(FILTER_CONFIG.dterm_lowpass_dyn_min_hz);
    $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]').val(FILTER_CONFIG.dterm_lowpass_dyn_max_hz);
    $('.pid_filter input[name="dtermLowpass2Frequency"]').val(FILTER_CONFIG.dterm_lowpass2_hz);
    $('.pid_filter select[name="dtermLowpassDynType').val(FILTER_CONFIG.dterm_lowpass_type);
    $('.pid_filter select[name="dtermLowpass2Type').val(FILTER_CONFIG.dterm_lowpass2_type);
    $('output[name="tuningDTermFilterSlider-number"]').val(this.dtermFilterSliderValue);
};