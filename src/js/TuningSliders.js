import MSP from "./msp";
import FC from "./fc";
import MSPCodes from "./msp/MSPCodes";
import semver from 'semver';
import { API_VERSION_1_47 } from "./data_storage";
import { isExpertModeEnabled } from "./utils/isExportModeEnabled";
import { mspHelper } from "./msp/MSPHelper";
import $ from 'jquery';

const TuningSliders = {
    sliderPidsMode: 2,
    sliderDGain: 1,
    sliderPIGain: 1,
    sliderFeedforwardGain: 1,
    sliderDMaxGain: 1,
    sliderIGain: 1,
    sliderRollPitchRatio: 1,
    sliderPitchPIGain: 1,
    sliderMasterMultiplier: 1,

    pidSlidersUnavailable: false,
    GyroSliderUnavailable: false,
    DTermSliderUnavailable: false,

    sliderGyroFilter: 1,
    sliderGyroFilterMultiplier: 1,
    sliderDTermFilter: 1,
    sliderDTermFilterMultiplier: 1,

    dMaxFeatureEnabled: true,
    defaultPDRatio: 0,
    PID_DEFAULT: [],
    FILTER_DEFAULT: {},
    SLIDER_DEFAULT: {},

    NON_EXPERT_SLIDER_MIN: 70,
    NON_EXPERT_SLIDER_MAX: 140,
    NON_EXPERT_SLIDER_MIN_GYRO: 50,
    NON_EXPERT_SLIDER_MAX_GYRO: 150,
    NON_EXPERT_SLIDER_MIN_DTERM: 80,
    NON_EXPERT_SLIDER_MAX_DTERM: 120,

    cachedPidSliderValues: false,
    cachedGyroSliderValues: false,
    cachedDTermSliderValues: false,

    expertMode: false,
};

const D_MAX_RATIO = 0.85;

TuningSliders.initialize = function() {
    this.PID_DEFAULT = FC.getPidDefaults();
    this.FILTER_DEFAULT = FC.getFilterDefaults();
    this.SLIDER_DEFAULT = FC.getSliderDefaults();

    this.setExpertMode(isExpertModeEnabled());

    // after refresh cached values are not available
    this.cachedPidSliderValues = false;
    this.cachedGyroSliderValues = false;
    this.cachedDTermSliderValues = false;

    this.initPidSlidersPosition();
    this.initGyroFilterSliderPosition();
    this.initDTermFilterSliderPosition();

    // If reading manual values while sliders are on we set the sliders off
    this.validateTuningSliders();

    this.updatePidSlidersDisplay();
    this.updateGyroFilterSliderDisplay();
    this.updateDTermFilterSliderDisplay();

    this.updateFilterSlidersWarning();

    $('.subtab-pid .slidersDisabled').hide();
    $('.subtab-filter .slidersDisabled').hide();
};

TuningSliders.updateExpertModePidSlidersDisplay = function() {
    const dGain = FC.TUNING_SLIDERS.slider_d_gain < this.NON_EXPERT_SLIDER_MIN || FC.TUNING_SLIDERS.slider_d_gain > this.NON_EXPERT_SLIDER_MAX;
    const piGain = FC.TUNING_SLIDERS.slider_pi_gain < this.NON_EXPERT_SLIDER_MIN || FC.TUNING_SLIDERS.slider_pi_gain > this.NON_EXPERT_SLIDER_MAX;
    const ffGain = FC.TUNING_SLIDERS.slider_feedforward_gain < this.NON_EXPERT_SLIDER_MIN || FC.TUNING_SLIDERS.slider_feedforward_gain > this.NON_EXPERT_SLIDER_MAX;

    const dMaxGain = FC.TUNING_SLIDERS.slider_dmax_gain !== FC.DEFAULT_TUNING_SLIDERS.slider_dmax_gain;
    const iGain = FC.TUNING_SLIDERS.slider_i_gain !== FC.DEFAULT_TUNING_SLIDERS.slider_i_gain;
    const rpRatio = FC.TUNING_SLIDERS.slider_roll_pitch_ratio !== FC.DEFAULT_TUNING_SLIDERS.slider_roll_pitch_ratio;
    const rpIGain = FC.TUNING_SLIDERS.slider_pitch_pi_gain !== FC.DEFAULT_TUNING_SLIDERS.slider_pitch_pi_gain;
    const master = FC.TUNING_SLIDERS.slider_master_multiplier !== FC.DEFAULT_TUNING_SLIDERS.slider_master_multiplier;

    const basic = dGain || piGain || ffGain;
    const advanced = dMaxGain || iGain || rpRatio || rpIGain || master;

    // disable sliders
    $('.baseSliderDGain').toggleClass('disabledSliders', !this.sliderPidsMode || (dGain && !this.expertMode));
    $('.baseSliderPIGain').toggleClass('disabledSliders', !this.sliderPidsMode || (piGain && !this.expertMode));
    $('.baseSliderFeedforwardGain').toggleClass('disabledSliders', !this.sliderPidsMode || (ffGain && !this.expertMode));

    $('.advancedSlider').toggleClass('disabledSliders', !this.sliderPidsMode || !this.expertMode);

    // hide advanced sliders if expert mode disabled
    $('.advancedSliderDmaxGain').toggle(dMaxGain || this.expertMode);
    $('.advancedSliderIGain').toggle(iGain || this.expertMode);
    $('.advancedSliderRollPitchRatio').toggle(rpRatio || this.expertMode);
    $('.advancedSliderPitchPIGain').toggle(rpIGain || this.expertMode);
    $('.advancedSliderMaster').toggle(master || this.expertMode);

    // disable input
    $('#sliderDGain').prop('disabled', !this.sliderPidsMode || (dGain && !this.expertMode));
    $('#sliderPIGain').prop('disabled', !this.sliderPidsMode || (piGain && !this.expertMode));
    $('#sliderFeedforwardGain').prop('disabled', !this.sliderPidsMode || (ffGain && !this.expertMode));

    $('#sliderDMaxGain').prop('disabled', !this.sliderPidsMode || (dMaxGain && !this.expertMode));
    $('#sliderIGain').prop('disabled', !this.sliderPidsMode || (iGain && !this.expertMode));
    $('#sliderRollPitchRatio').prop('disabled', !this.sliderPidsMode || (rpRatio && !this.expertMode));
    $('#sliderPitchPIGain').prop('disabled', !this.sliderPidsMode || (rpIGain && !this.expertMode));
    $('#sliderMasterMultiplier').prop('disabled', !this.sliderPidsMode || (master && !this.expertMode));

    $('.subtab-pid .expertSettingsDetectedNote').toggle(!this.sliderPidsMode || ((basic || advanced) && !this.expertMode));
};

TuningSliders.updateExpertModeFilterSlidersDisplay = function() {
    const gyroOutsideExpertMode = (FC.TUNING_SLIDERS.slider_gyro_filter_multiplier < this.NON_EXPERT_SLIDER_MIN_GYRO || FC.TUNING_SLIDERS.slider_gyro_filter_multiplier > this.NON_EXPERT_SLIDER_MAX_GYRO) && !this.expertMode;
    const dtermOutsideExpertMode = (FC.TUNING_SLIDERS.slider_dterm_filter_multiplier < this.NON_EXPERT_SLIDER_MIN_DTERM || FC.TUNING_SLIDERS.slider_dterm_filter_multiplier > this.NON_EXPERT_SLIDER_MAX_DTERM) && !this.expertMode;

    const gyroLowpassDynMinFrequency = $('.pid_filter input[name="gyroLowpassDynMinFrequency"]');
    const gyroLowpassFrequency = $('.pid_filter input[name="gyroLowpassFrequency"]');
    const gyroLowpass2Frequency = $('.pid_filter input[name="gyroLowpass2Frequency"]');

    const dtermLowpassDynMinFrequency = $('.pid_filter input[name="dtermLowpassDynMinFrequency"]');
    const dtermLowpassFrequency = $('.pid_filter input[name="dtermLowpassFrequency"]');
    const dtermLowpass2Frequency = $('.pid_filter input[name="dtermLowpass2Frequency"]');

    const gyroLowPassDisabled = parseInt(gyroLowpassDynMinFrequency.val()) === 0 && parseInt(gyroLowpassFrequency.val()) === 0 && parseInt(gyroLowpass2Frequency.val()) === 0;
    const dtermLowPassDisabled = parseInt(dtermLowpassDynMinFrequency.val()) === 0 && parseInt(dtermLowpassFrequency.val()) === 0 && parseInt(dtermLowpass2Frequency.val()) === 0;

    const disableGyroSlider = !this.sliderGyroFilter || gyroOutsideExpertMode || gyroLowPassDisabled;
    const disableDTermSlider = !this.sliderDTermFilter || dtermOutsideExpertMode || dtermLowPassDisabled;

    $('.sliderGyroFilter').toggleClass('disabledSliders', disableGyroSlider);
    $('.sliderDTermFilter').toggleClass('disabledSliders', disableDTermSlider);

    $('#sliderGyroFilterMultiplier').prop('disabled', disableGyroSlider);
    $('#sliderDTermFilterMultiplier').prop('disabled', disableDTermSlider);

    $('.subtab-filter .expertSettingsDetectedNote').toggle(gyroOutsideExpertMode || dtermOutsideExpertMode);
};

TuningSliders.setExpertMode = function(expertModeEnabled) {
    this.expertMode = expertModeEnabled;

    this.updateExpertModePidSlidersDisplay();
    this.updateExpertModeFilterSlidersDisplay();

    $('.tab-pid_tuning .legacySlider').hide();
    $('.legacyNonExpertModeSlidersNote').hide();
    $('.subtab-pid .nonExpertModeSlidersNote').toggle(!this.pidSlidersUnavailable && !this.expertMode);
    $('.subtab-filter .nonExpertModeSlidersNote').toggle((!this.GyroSliderUnavailable || !this.DTermSliderUnavailable) && !this.expertMode);
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
    this.sliderPidsMode = FC.TUNING_SLIDERS.slider_pids_mode;
    this.sliderDGain = FC.TUNING_SLIDERS.slider_d_gain / 100;
    this.sliderPIGain = FC.TUNING_SLIDERS.slider_pi_gain / 100;
    this.sliderFeedforwardGain = FC.TUNING_SLIDERS.slider_feedforward_gain / 100;
    this.sliderDMaxGain = FC.TUNING_SLIDERS.slider_dmax_gain / 100;
    this.sliderIGain = FC.TUNING_SLIDERS.slider_i_gain / 100;
    this.sliderRollPitchRatio = FC.TUNING_SLIDERS.slider_roll_pitch_ratio / 100;
    this.sliderPitchPIGain = FC.TUNING_SLIDERS.slider_pitch_pi_gain / 100;
    this.sliderMasterMultiplier = FC.TUNING_SLIDERS.slider_master_multiplier / 100;

    $('output[name="sliderDGain-number"]').val(this.sliderDGain);
    $('output[name="sliderPIGain-number"]').val(this.sliderPIGain);
    $('output[name="sliderFeedforwardGain-number"]').val(this.sliderFeedforwardGain);
    $('output[name="sliderDMaxGain-number"]').val(this.sliderDMaxGain);
    $('output[name="sliderIGain-number"]').val(this.sliderIGain);
    $('output[name="sliderRollPitchRatio-number"]').val(this.sliderRollPitchRatio);
    $('output[name="sliderPitchPIGain-number"]').val(this.sliderPitchPIGain);
    $('output[name="sliderMasterMultiplier-number"]').val(this.sliderMasterMultiplier);

    $('#sliderDGain').val(this.sliderDGain);
    $('#sliderPIGain').val(this.sliderPIGain);
    $('#sliderFeedforwardGain').val(this.sliderFeedforwardGain);
    $('#sliderDMaxGain').val(this.sliderDMaxGain);
    $('#sliderIGain').val(this.sliderIGain);
    $('#sliderRollPitchRatio').val(this.sliderRollPitchRatio);
    $('#sliderPitchPIGain').val(this.sliderPitchPIGain);
    $('#sliderMasterMultiplier').val(this.sliderMasterMultiplier);
};

TuningSliders.initGyroFilterSliderPosition = function() {
    this.sliderGyroFilter = FC.TUNING_SLIDERS.slider_gyro_filter;
    this.sliderGyroFilterMultiplier = FC.TUNING_SLIDERS.slider_gyro_filter_multiplier / 100;

    $('#sliderGyroFilterMultiplier').val(this.sliderGyroFilterMultiplier);
    $('output[name="sliderGyroFilterMultiplier-number"]').val(this.sliderGyroFilterMultiplier);
};

TuningSliders.initDTermFilterSliderPosition = function() {
    this.sliderDTermFilter = FC.TUNING_SLIDERS.slider_dterm_filter;
    this.sliderDTermFilterMultiplier = FC.TUNING_SLIDERS.slider_dterm_filter_multiplier / 100;

    $('#sliderDTermFilterMultiplier').val(this.sliderDTermFilterMultiplier);
    $('output[name="sliderDTermFilterMultiplier-number"]').val(this.sliderDTermFilterMultiplier);
};

TuningSliders.gyroFilterSliderEnable = function() {
    this.sliderGyroFilter = 1;
    this.calculateNewGyroFilters();
};

TuningSliders.dtermFilterSliderEnable = function() {
    this.sliderDTermFilter = 1;
    this.calculateNewDTermFilters();
};

TuningSliders.gyroFilterSliderDisable = function() {
    FC.TUNING_SLIDERS.slider_gyro_filter = 0;
    this.updateGyroFilterSliderDisplay();
};

TuningSliders.dtermFilterSliderDisable = function() {
    FC.TUNING_SLIDERS.slider_dterm_filter = 0;
    this.updateDTermFilterSliderDisplay();
};

TuningSliders.updateSlidersWarning = function(slidersUnavailable = false) {
    const WARNING_P_GAIN = 70;
    const WARNING_D_MAX_GAIN = 60;
    const WARNING_I_GAIN = 2.5 * FC.PIDS[0][0];
    const WARNING_D_GAIN = 42;
    const enableWarning = semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_47)
        ? FC.PIDS[0][0] > WARNING_P_GAIN || FC.PIDS[0][1] > WARNING_I_GAIN || FC.PIDS[0][2] > WARNING_D_MAX_GAIN || FC.ADVANCED_TUNING.dMaxRoll > WARNING_D_GAIN
        : FC.PIDS[0][0] > WARNING_P_GAIN || FC.PIDS[0][1] > WARNING_I_GAIN || FC.PIDS[0][2] > WARNING_D_GAIN || FC.ADVANCED_TUNING.dMaxRoll > WARNING_D_MAX_GAIN;

    $('.subtab-pid .slidersWarning').toggle(enableWarning && !slidersUnavailable);
};

TuningSliders.updateFilterSlidersWarning = function() {
    const WARNING_FILTER_GYRO_LOW_GAIN = 0.45;
    const WARNING_FILTER_GYRO_HIGH_GAIN = 1.55;
    const WARNING_FILTER_DTERM_LOW_GAIN = 0.75;
    const WARNING_FILTER_DTERM_HIGH_GAIN = 1.25;

    $('.subtab-filter .slidersWarning').toggle((this.sliderGyroFilterMultiplier >= WARNING_FILTER_GYRO_HIGH_GAIN
        || this.sliderGyroFilterMultiplier <= WARNING_FILTER_GYRO_LOW_GAIN)
        || (this.sliderDTermFilterMultiplier >= WARNING_FILTER_DTERM_HIGH_GAIN || this.sliderDTermFilterMultiplier <= WARNING_FILTER_DTERM_LOW_GAIN));
};

TuningSliders.updatePidSlidersDisplay = function() {
    // check if pid values changed manually by comparing the current values with those calculated by the sliders,
    // if all of them are equal the values haven't been changed manually
    $('#pid_main .ROLL .pid_data input, #pid_main .PITCH .pid_data input').each((_, el) => $(el).prop('disabled', this.sliderPidsMode > 0));
    $('#pid_main .YAW .pid_data input').each((_, el) => $(el).prop('disabled', this.sliderPidsMode === 2));

    this.updateExpertModePidSlidersDisplay();

    $('#sliderPidsModeSelect').val(this.sliderPidsMode);

    this.updateSlidersWarning(this.pidSlidersUnavailable);
};

TuningSliders.updateGyroFilterSliderDisplay = function() {
    // check if enabled filters were changed manually by comparing current value and those based on slider position
    const gyroLowpassDynMinFrequency = $('.pid_filter input[name="gyroLowpassDynMinFrequency"]');
    const gyroLowpassDynMaxFrequency = $('.pid_filter input[name="gyroLowpassDynMaxFrequency"]');
    const gyroLowpassFrequency = $('.pid_filter input[name="gyroLowpassFrequency"]');
    const gyroLowpass2Frequency = $('.pid_filter input[name="gyroLowpass2Frequency"]');

    const outsideExpertMode = (FC.TUNING_SLIDERS.slider_gyro_filter_multiplier < this.NON_EXPERT_SLIDER_MIN_GYRO || FC.TUNING_SLIDERS.slider_gyro_filter_multiplier > this.NON_EXPERT_SLIDER_MAX_GYRO) && !this.expertMode;

    if (FC.TUNING_SLIDERS.slider_gyro_filter === 0) {
        this.GyroSliderUnavailable = true;
        this.sliderGyroFilter = 0;
    } else {
        this.GyroSliderUnavailable = false;
        this.sliderGyroFilter = 1;
        this.cachedGyroSliderValues = true;
    }

    // set lowpass values
    gyroLowpassDynMinFrequency.val(FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz).prop('disabled', this.sliderGyroFilter);
    gyroLowpassDynMaxFrequency.val(FC.FILTER_CONFIG.gyro_lowpass_dyn_max_hz).prop('disabled', this.sliderGyroFilter);
    gyroLowpassFrequency.val(FC.FILTER_CONFIG.gyro_lowpass_hz).prop('disabled', this.sliderGyroFilter);
    gyroLowpass2Frequency.val(FC.FILTER_CONFIG.gyro_lowpass2_hz).prop('disabled', this.sliderGyroFilter);

    $('output[name="sliderGyroFilterMultiplier-number"]').val(this.sliderGyroFilterMultiplier);

    const gyroLowPassDisabled = FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz === 0 && FC.FILTER_CONFIG.gyro_lowpass_hz === 0 && FC.FILTER_CONFIG.gyro_lowpass2_hz === 0;
    const disableSlider = gyroLowPassDisabled || outsideExpertMode || this.GyroSliderUnavailable;

    // update Gyro mode and slider
    $('select[id="sliderGyroFilterModeSelect"]').val(this.sliderGyroFilter);
    $('.sliderGyroFilter').toggleClass('disabledSliders', disableSlider);
    $('input[id="sliderGyroFilterMultiplier"]').prop('disabled', disableSlider);

    this.updateFilterSlidersWarning();
};

TuningSliders.updateDTermFilterSliderDisplay = function() {
    // check if enabled filters were changed manually by comparing current value and those based on slider position
    const dtermLowpassDynMinFrequency = $('.pid_filter input[name="dtermLowpassDynMinFrequency"]');
    const dtermLowpassDynMaxFrequency = $('.pid_filter input[name="dtermLowpassDynMaxFrequency"]');
    const dtermLowpassFrequency = $('.pid_filter input[name="dtermLowpassFrequency"]');
    const dtermLowpass2Frequency = $('.pid_filter input[name="dtermLowpass2Frequency"]');

    const outsideExpertMode = (FC.TUNING_SLIDERS.slider_dterm_filter_multiplier < this.NON_EXPERT_SLIDER_MIN_DTERM || FC.TUNING_SLIDERS.slider_dterm_filter_multiplier > this.NON_EXPERT_SLIDER_MAX_DTERM) && !this.expertMode;

    if (FC.TUNING_SLIDERS.slider_dterm_filter === 0) {
        this.DTermSliderUnavailable = true;
        this.sliderDTermFilter = 0;
    } else {
        this.DTermSliderUnavailable = false;
        this.sliderDTermFilter = 1;
        this.cachedDTermSliderValues = true;
    }

    // set lowpass values
    dtermLowpassDynMinFrequency.val(FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz).prop('disabled', this.sliderDTermFilter);
    dtermLowpassDynMaxFrequency.val(FC.FILTER_CONFIG.dterm_lowpass_dyn_max_hz).prop('disabled', this.sliderDTermFilter);
    dtermLowpassFrequency.val(FC.FILTER_CONFIG.dterm_lowpass_hz).prop('disabled', this.sliderDTermFilter);
    dtermLowpass2Frequency.val(FC.FILTER_CONFIG.dterm_lowpass2_hz).prop('disabled', this.sliderDTermFilter);

    const dtermLowPassDisabled = FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz === 0 && FC.FILTER_CONFIG.dterm_lowpass_hz === 0 && FC.FILTER_CONFIG.dterm_lowpass2_hz === 0;
    const disableSlider = dtermLowPassDisabled || outsideExpertMode || this.DTermSliderUnavailable;

    $('output[name="sliderDTermFilterMultiplier-number"]').val(this.sliderDTermFilterMultiplier);

    // update DTerm mode and slider
    $('select[id="sliderDTermFilterModeSelect"]').val(this.sliderDTermFilter);
    $('.sliderDTermFilter').toggleClass('disabledSliders', disableSlider);
    $('input[id="sliderDTermFilterMultiplier"]').prop('disabled', disableSlider);

    this.updateFilterSlidersWarning();
};

TuningSliders.updateFilterSlidersDisplay = function() {
    // check if filters changed manually by comparing current value and those based on slider position

    this.updateGyroFilterSliderDisplay();
    this.updateDTermFilterSliderDisplay();

    $('.subtab-filter .nonExpertModeSlidersNote').toggle((!this.GyroSliderUnavailable || !this.DTermSliderUnavailable) && !this.expertMode);
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

        $('.pid_tuning input[name="dMaxRoll"]').val(FC.ADVANCED_TUNING.dMaxRoll);
        $('.pid_tuning input[name="dMaxPitch"]').val(FC.ADVANCED_TUNING.dMaxPitch);
        $('.pid_tuning input[name="dMaxYaw"]').val(FC.ADVANCED_TUNING.dMaxYaw);
        $('.pid_tuning .ROLL input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardRoll);
        $('.pid_tuning .PITCH input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardPitch);
        $('.pid_tuning .YAW input[name="f"]').val(FC.ADVANCED_TUNING.feedforwardYaw);
    }

    $('output[name="sliderDGain-number"]').val(this.sliderDGain);
    $('output[name="sliderPIGain-number"]').val(this.sliderPIGain);
    $('output[name="sliderFeedforwardGain-number"]').val(this.sliderFeedforwardGain);
    $('output[name="sliderDMaxGain-number"]').val(this.sliderDMaxGain);
    $('output[name="sliderIGain-number"]').val(this.sliderIGain);
    $('output[name="sliderRollPitchRatio-number"]').val(this.sliderRollPitchRatio);
    $('output[name="sliderPitchPIGain-number"]').val(this.sliderPitchPIGain);
    $('output[name="sliderMasterMultiplier-number"]').val(this.sliderMasterMultiplier);

    this.updateSlidersWarning();
};

TuningSliders.calculateNewPids = function(updateSlidersOnly = false) {
    // this is the main calculation for PID sliders, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    FC.TUNING_SLIDERS.slider_pids_mode = this.sliderPidsMode;
    //rounds slider values to nearies multiple of 5 and passes to the FW. Avoid dividing calc by (* x 100)/5 = 20
    FC.TUNING_SLIDERS.slider_d_gain = Math.round(this.sliderDGain * 20) * 5;
    FC.TUNING_SLIDERS.slider_pi_gain = Math.round(this.sliderPIGain * 20) * 5;
    FC.TUNING_SLIDERS.slider_feedforward_gain = Math.round(this.sliderFeedforwardGain * 20) * 5;
    FC.TUNING_SLIDERS.slider_dmax_gain = Math.round(this.sliderDMaxGain * 20) * 5;
    FC.TUNING_SLIDERS.slider_i_gain = Math.round(this.sliderIGain * 20) * 5;
    FC.TUNING_SLIDERS.slider_roll_pitch_ratio = Math.round(this.sliderRollPitchRatio * 20) * 5;
    FC.TUNING_SLIDERS.slider_pitch_pi_gain = Math.round(this.sliderPitchPIGain * 20) * 5;
    FC.TUNING_SLIDERS.slider_master_multiplier = Math.round(this.sliderMasterMultiplier * 20) * 5;

    this.readSimplifiedPids();
};


TuningSliders.calculateNewGyroFilters = function() {
    // this is the main calculation for Gyro Filter slider, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    this.readSimplifiedGyroFilters();
};

TuningSliders.calculateNewDTermFilters = function() {
    // this is the main calculation for DTerm Filter slider, inputs are in form of slider position values
    // values get set both into forms and their respective variables
    this.readSimplifiedDTermFilters();
};

TuningSliders.readSimplifiedPids = function(updateSlidersOnly = false) {
    FC.TUNING_SLIDERS.slider_pids_mode = this.sliderPidsMode;
    FC.TUNING_SLIDERS.slider_master_multiplier = Math.round(this.sliderMasterMultiplier * 100);
    FC.TUNING_SLIDERS.slider_roll_pitch_ratio = Math.round(this.sliderRollPitchRatio * 100);
    FC.TUNING_SLIDERS.slider_i_gain = Math.round(this.sliderIGain * 100);
    FC.TUNING_SLIDERS.slider_d_gain = Math.round(this.sliderDGain * 100);
    FC.TUNING_SLIDERS.slider_pi_gain = Math.round(this.sliderPIGain * 100);
    FC.TUNING_SLIDERS.slider_dmax_gain = Math.round(this.sliderDMaxGain * 100);
    FC.TUNING_SLIDERS.slider_feedforward_gain = Math.round(this.sliderFeedforwardGain * 100);
    FC.TUNING_SLIDERS.slider_pitch_pi_gain = Math.round(this.sliderPitchPIGain * 100);

    MSP.promise(MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID, mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_PID))
    .then(() => this.updateFormPids(updateSlidersOnly));
};

TuningSliders.readSimplifiedGyroFilters = function() {
    FC.TUNING_SLIDERS.slider_gyro_filter = this.sliderGyroFilter;
    FC.TUNING_SLIDERS.slider_gyro_filter_multiplier = this.sliderGyroFilterMultiplier * 100;

    FC.FILTER_CONFIG.gyro_lowpass_hz = parseInt($('.pid_filter input[name="gyroLowpassFrequency"]').val());
    FC.FILTER_CONFIG.gyro_lowpass2_hz = parseInt($('.pid_filter input[name="gyroLowpass2Frequency"]').val());
    FC.FILTER_CONFIG.gyro_lowpass_dyn_min_hz = parseInt($('.pid_filter input[name="gyroLowpassDynMinFrequency"]').val());

    MSP.promise(MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO, mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_GYRO))
    .then(() => this.updateGyroFilterSliderDisplay());
};

TuningSliders.readSimplifiedDTermFilters = function() {
    FC.TUNING_SLIDERS.slider_dterm_filter = this.sliderDTermFilter;
    FC.TUNING_SLIDERS.slider_dterm_filter_multiplier = this.sliderDTermFilterMultiplier * 100;

    FC.FILTER_CONFIG.dterm_lowpass_hz = parseInt($('.pid_filter input[name="dtermLowpassFrequency"]').val());
    FC.FILTER_CONFIG.dterm_lowpass2_hz = parseInt($('.pid_filter input[name="dtermLowpass2Frequency"]').val());
    FC.FILTER_CONFIG.dterm_lowpass_dyn_min_hz = parseInt($('.pid_filter input[name="dtermLowpassDynMinFrequency"]').val());

    MSP.promise(MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM, mspHelper.crunch(MSPCodes.MSP_CALCULATE_SIMPLIFIED_DTERM))
    .then(() => this.updateDTermFilterSliderDisplay());
};

TuningSliders.validateTuningSliders = function() {
    MSP.promise(MSPCodes.MSP_VALIDATE_SIMPLIFIED_TUNING)
    .then(() => {
        this.sliderPidsMode = FC.TUNING_SLIDERS.slider_pids_valid > 0 ? FC.TUNING_SLIDERS.slider_pids_mode : 0;
        this.sliderGyroFilter = FC.TUNING_SLIDERS.slider_gyro_valid;
        this.sliderDTermFilter = FC.TUNING_SLIDERS.slider_dterm_valid;

        FC.TUNING_SLIDERS.slider_pids_mode = FC.TUNING_SLIDERS.slider_pids_valid ? FC.TUNING_SLIDERS.slider_pids_mode : 0;
        FC.TUNING_SLIDERS.slider_gyro_filter = FC.TUNING_SLIDERS.slider_gyro_valid ? FC.TUNING_SLIDERS.slider_gyro_filter : 0;
        FC.TUNING_SLIDERS.slider_dterm_filter = FC.TUNING_SLIDERS.slider_dterm_valid ? FC.TUNING_SLIDERS.slider_dterm_filter : 0;

        $('#sliderPidsModeSelect').val(this.sliderPidsMode);
        $('#sliderGyroFilterModeSelect').val(this.sliderGyroFilter);
        $('#sliderDTermFilterModeSelect').val(this.sliderDTermFilter);

        this.updatePidSlidersDisplay();
        this.updateGyroFilterSliderDisplay();
        this.updateDTermFilterSliderDisplay();
    });
};

export default TuningSliders;
