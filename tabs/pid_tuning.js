'use strict';

TABS.pid_tuning = {
    controllerChanged: false
};

TABS.pid_tuning.initialize = function (callback) {
    var self = this;

    if (GUI.active_tab != 'pid_tuning') {
        GUI.active_tab = 'pid_tuning';
    }

    // requesting MSP_STATUS manually because it contains CONFIG.profile
    MSP.promise(MSP_codes.MSP_STATUS).then(function() {
        if (GUI.canChangePidController) {
            return MSP.promise(MSP_codes.MSP_PID_CONTROLLER);
        }
        return true;
    }).then(function() {
        return MSP.promise(MSP_codes.MSP_PIDNAMES)
    }).then(function() {
        return MSP.promise(MSP_codes.MSP_PID);
    }).then(function() {
        return MSP.promise(MSP_codes.MSP_RC_TUNING);
    }).then(function() {
        return MSP.promise(MSP_codes.MSP_SPECIAL_PARAMETERS);
    }).then(function() {
        return MSP.promise(MSP_codes.MSP_ADVANCED_TUNING);
    }).then(function() {
        return MSP.promise(MSP_codes.MSP_FILTER_CONFIG);
    }).then(function() {
        $('#content').load("./tabs/pid_tuning.html", process_html);
    });

    function pid_and_rc_to_form() {
        // Fill in the data from PIDs array
        var i = 0;
        $('.pid_tuning .ROLL input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[0][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[0][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[0][i++]);
                    break;
            }
        });

        i = 0;
        $('.pid_tuning .PITCH input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[1][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[1][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[1][i++]);
                    break;
            }
        });

        i = 0;
        $('.pid_tuning .YAW input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[2][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[2][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[2][i++]);
                    break;
            }
        });

        i = 0;
        $('.pid_tuning .ALT input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[3][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[3][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[3][i++]);
                    break;
            }
        });

        i = 0;
        $('.pid_tuning .Pos input').each(function () {
            $(this).val(PIDs[4][i++]);
        });

        i = 0;
        $('.pid_tuning .PosR input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[5][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[5][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[5][i++]);
                    break;
            }
        });

        i = 0;
        $('.pid_tuning .NavR input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[6][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[6][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[6][i++]);
                    break;
            }
        });

        i = 0;
        $('.pid_tuning .LEVEL input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[7][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[7][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[7][i++]);
                    break;
            }
        });

        i = 0;
        $('.pid_tuning .MAG input').each(function () {
            $(this).val(PIDs[8][i++]);
        });

        i = 0;
        $('.pid_tuning .Vario input').each(function () {
            switch (i) {
                case 0:
                    $(this).val(PIDs[9][i++]);
                    break;
                case 1:
                    $(this).val(PIDs[9][i++]);
                    break;
                case 2:
                    $(this).val(PIDs[9][i++]);
                    break;
            }
        });

        // Fill in data from RC_tuning object
        $('.pid_tuning input[name="rc_rate"]').val(RC_tuning.RC_RATE.toFixed(2));
        $('.pid_tuning input[name="roll_pitch_rate"]').val(RC_tuning.roll_pitch_rate.toFixed(2));
        $('.pid_tuning input[name="roll_rate"]').val(RC_tuning.roll_rate.toFixed(2));
        $('.pid_tuning input[name="pitch_rate"]').val(RC_tuning.pitch_rate.toFixed(2));
        $('.pid_tuning input[name="yaw_rate"]').val(RC_tuning.yaw_rate.toFixed(2));
        $('.pid_tuning input[name="rc_expo"]').val(RC_tuning.RC_EXPO.toFixed(2));
        $('.pid_tuning input[name="rc_yaw_expo"]').val(RC_tuning.RC_YAW_EXPO.toFixed(2));
        $('.pid_tuning input[name="rc_rate_yaw"]').val(SPECIAL_PARAMETERS.RC_RATE_YAW.toFixed(2));

        $('.throttle input[name="mid"]').val(RC_tuning.throttle_MID.toFixed(2));
        $('.throttle input[name="expo"]').val(RC_tuning.throttle_EXPO.toFixed(2));

        $('.tpa input[name="tpa"]').val(RC_tuning.dynamic_THR_PID.toFixed(2));
        $('.tpa input[name="tpa-breakpoint"]').val(RC_tuning.dynamic_THR_breakpoint);

        if (semver.lt(CONFIG.apiVersion, "1.10.0")) {
            $('.pid_tuning input[name="rc_yaw_expo"]').hide();
            $('.pid_tuning input[name="rc_expo"]').attr("rowspan", "3");
        }

        $('.pid_filter .gyro').val(FILTER_CONFIG.gyro_soft_lpf_hz);
        $('.pid_filter .dterm').val(FILTER_CONFIG.dterm_lpf_hz);
        $('.pid_filter .yaw').val(FILTER_CONFIG.yaw_lpf_hz);

        if (CONFIG.flightControllerIdentifier == "BTFL" && semver.lt(CONFIG.flightControllerVersion, "2.8.1")) {
            $('.pid_filter').hide();
            $('.pid_tuning input[name="rc_rate_yaw"]').hide();
        }
    }

    function form_to_pid_and_rc() {
        // Catch all the changes and stuff the inside PIDs array
        var i = 0;
        $('table.pid_tuning tr.ROLL input').each(function () {
            PIDs[0][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.PITCH input').each(function () {
            PIDs[1][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.YAW input').each(function () {
            PIDs[2][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.ALT input').each(function () {
            PIDs[3][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.Vario input').each(function () {
            PIDs[9][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.Pos input').each(function () {
            PIDs[4][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.PosR input').each(function () {
            PIDs[5][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.NavR input').each(function () {
            PIDs[6][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.LEVEL input').each(function () {
            PIDs[7][i++] = parseFloat($(this).val());
        });

        i = 0;
        $('table.pid_tuning tr.MAG input').each(function () {
            PIDs[8][i++] = parseFloat($(this).val());
        });

        // catch RC_tuning changes
        RC_tuning.RC_RATE = parseFloat($('.pid_tuning input[name="rc_rate"]').val());
        RC_tuning.roll_pitch_rate = parseFloat($('.pid_tuning input[name="roll_pitch_rate"]').val());
        RC_tuning.roll_rate = parseFloat($('.pid_tuning input[name="roll_rate"]').val());
        RC_tuning.pitch_rate = parseFloat($('.pid_tuning input[name="pitch_rate"]').val());
        RC_tuning.yaw_rate = parseFloat($('.pid_tuning input[name="yaw_rate"]').val());
        RC_tuning.RC_EXPO = parseFloat($('.pid_tuning input[name="rc_expo"]').val());
        RC_tuning.RC_YAW_EXPO = parseFloat($('.pid_tuning input[name="rc_yaw_expo"]').val());
        SPECIAL_PARAMETERS.RC_RATE_YAW = parseFloat($('.pid_tuning input[name="rc_rate_yaw"]').val());

        RC_tuning.throttle_MID = parseFloat($('.throttle input[name="mid"]').val());
        RC_tuning.throttle_EXPO = parseFloat($('.throttle input[name="expo"]').val())

        RC_tuning.dynamic_THR_PID = parseFloat($('.tpa input[name="tpa"]').val());
        RC_tuning.dynamic_THR_breakpoint = parseInt($('.tpa input[name="tpa-breakpoint"]').val());
        FILTER_CONFIG.gyro_soft_lpf_hz = parseInt($('.pid_filter .gyro').val());
        FILTER_CONFIG.dterm_lpf_hz = parseInt($('.pid_filter .dterm').val());
        FILTER_CONFIG.yaw_lpf_hz = parseInt($('.pid_filter .yaw').val());
    }
    function hideUnusedPids(sensors_detected) {
      $('.tab-pid_tuning table.pid_tuning').hide();
      $('#pid_main').show();

      if (have_sensor(sensors_detected, 'acc')) {
        $('#pid_accel').show();
      }
      if (have_sensor(sensors_detected, 'baro')) {
        $('#pid_baro').show();
      }
      if (have_sensor(sensors_detected, 'mag')) {
        $('#pid_mag').show();
      }
      if (bit_check(BF_CONFIG.features, 7)) {   //This will need to be reworked to remove BF_CONFIG reference eventually
        $('#pid_gps').show();
      }
      if (have_sensor(sensors_detected, 'sonar')) {
        $('#pid_baro').show();
      }
    }
    function process_html() {
        // translate to user-selected language
        localize();

        hideUnusedPids(CONFIG.activeSensors);

        $('#showAllPids').on('click', function(){
          if($(this).text() == "Show all PIDs") {
            $('.tab-pid_tuning table.pid_tuning').show();
            $(this).text('Hide unused PIDs');
          } else {
            hideUnusedPids(CONFIG.activeSensors);
            $(this).text('Show all PIDs');
          }
        });

        $('#resetPIDs').on('click', function(){
          MSP.send_message(MSP_codes.MSP_SET_RESET_CURR_PID, false, false, false);
          updateActivatedTab();
        });

        $('.pid_tuning tr').each(function(){
          for(i = 0; i < PID_names.length; i++) {
            if($(this).hasClass(PID_names[i])) {
              $(this).find('td:first').text(PID_names[i]);
            }
          }
        });

        pid_and_rc_to_form();

        var pidController_e = $('select[name="controller"]');


        var pidControllerList;

        if (semver.lt(CONFIG.apiVersion, "1.14.0")) {
            pidControllerList = [
                { name: "MultiWii (Old)"},
                { name: "MultiWii (rewrite)"},
                { name: "LuxFloat"},
                { name: "MultiWii (2.3 - latest)"},
                { name: "MultiWii (2.3 - hybrid)"},
                { name: "Harakiri"}
            ]
        } else {
            pidControllerList = [
                { name: ""},
                { name: "Integer"},
                { name: "Float"},
            ]
        }

        for (var i = 0; i < pidControllerList.length; i++) {
            pidController_e.append('<option value="' + (i) + '">' + pidControllerList[i].name + '</option>');
        }


        var form_e = $('#pid-tuning');

        if (GUI.canChangePidController) {
            pidController_e.val(PID.controller);
        } else {
            GUI.log(chrome.i18n.getMessage('pidTuningUpgradeFirmwareToChangePidController', [CONFIG.apiVersion, CONFIGURATOR.pidControllerChangeMinApiVersion]));

            pidController_e.empty();
            pidController_e.append('<option value="">Unknown</option>');

            pidController_e.prop('disabled', true);
        }

        if (semver.lt(CONFIG.apiVersion, "1.7.0")) {
            $('.tpa .tpa-breakpoint').hide();

            $('.pid_tuning .roll_rate').hide();
            $('.pid_tuning .pitch_rate').hide();
        } else {
            $('.pid_tuning .roll_pitch_rate').hide();
        }

        // UI Hooks
        $('.throttle input').on('input change', function () {
            setTimeout(function () { // let global validation trigger and adjust the values firs
                var throttleMidE = $('.throttle input[name="mid"]'),
                    throttleExpoE = $('.throttle input[name="expo"]'),
                    mid = parseFloat(throttleMidE.val()),
                    expo = parseFloat(throttleExpoE.val()),
                    throttleCurve = $('.throttle .throttle_curve canvas').get(0),
                    context = throttleCurve.getContext("2d");

                // local validation to deal with input event
                if (mid >= parseFloat(throttleMidE.prop('min')) &&
                    mid <= parseFloat(throttleMidE.prop('max')) &&
                    expo >= parseFloat(throttleExpoE.prop('min')) &&
                    expo <= parseFloat(throttleExpoE.prop('max'))) {
                    // continue
                } else {
                    return;
                }

                var canvasHeight = throttleCurve.height;
                var canvasWidth = throttleCurve.width;

                // math magic by englishman
                var midx = canvasWidth * mid,
                    midxl = midx * 0.5,
                    midxr = (((canvasWidth - midx) * 0.5) + midx),
                    midy = canvasHeight - (midx * (canvasHeight / canvasWidth)),
                    midyl = canvasHeight - ((canvasHeight - midy) * 0.5 *(expo + 1)),
                    midyr = (midy / 2) * (expo + 1);

                // draw
                context.clearRect(0, 0, canvasWidth, canvasHeight);
                context.beginPath();
                context.moveTo(0, canvasHeight);
                context.quadraticCurveTo(midxl, midyl, midx, midy);
                context.moveTo(midx, midy);
                context.quadraticCurveTo(midxr, midyr, canvasWidth, 0);
                context.lineWidth = 2;
                context.strokeStyle = '#ffbb00';
                context.stroke();
            }, 0);
        }).trigger('input');

        $('a.refresh').click(function () {
            GUI.tab_switch_cleanup(function () {
                GUI.log(chrome.i18n.getMessage('pidTuningDataRefreshed'));
                TABS.pid_tuning.initialize();
            });
        });

        form_e.find('input').each(function (k, item) {
            $(item).change(function () {
                pidController_e.prop("disabled", true);
                TABS.pid_tuning.controllerChanged = false;
            })
        });

        pidController_e.change(function () {
            if (PID.controller != pidController_e.val()) {
                form_e.find('input').each(function (k, item) {
                    $(item).prop('disabled', true);
                    TABS.pid_tuning.controllerChanged = true;
                });
            }
        });

        $('.delta select').val(ADVANCED_TUNING.deltaMethod).change(function() {
            ADVANCED_TUNING.deltaMethod = $(this).val();
        });

        if (CONFIG.flightControllerIdentifier == "BTFL" && semver.lt(CONFIG.flightControllerVersion, "2.8.2")) {
            $('.delta').hide();
            $('.note').hide();
        }

        // update == save.
        $('a.update').click(function () {
            form_to_pid_and_rc();
            if (GUI.canChangePidController && TABS.pid_tuning.controllerChanged) {
                PID.controller = pidController_e.val();
                MSP.send_message(MSP_codes.MSP_SET_PID_CONTROLLER, MSP.crunch(MSP_codes.MSP_SET_PID_CONTROLLER), false, function () {
                    MSP.send_message(MSP_codes.MSP_EEPROM_WRITE, false, false, function () {
                        GUI.log(chrome.i18n.getMessage('pidTuningEepromSaved'));
                    });
                    TABS.pid_tuning.initialize();
                });
            } else {
                if (TABS.pid_tuning.controllerChanged) { return; }
                MSP.promise(MSP_codes.MSP_SET_PID, MSP.crunch(MSP_codes.MSP_SET_PID)).then(function() {
                    if (TABS.pid_tuning.controllerChanged) { Promise.reject('pid controller changed'); }
                    if (CONFIG.flightControllerIdentifier == "BTFL" && semver.gte(CONFIG.flightControllerVersion, "2.8.1")) {
                        return MSP.promise(MSP_codes.MSP_SET_SPECIAL_PARAMETERS, MSP.crunch(MSP_codes.MSP_SET_SPECIAL_PARAMETERS));
                    }
                }).then(function() {
                    if (TABS.pid_tuning.controllerChanged) { Promise.reject('pid controller changed'); }
                    return MSP.promise(MSP_codes.MSP_SET_ADVANCED_TUNING, MSP.crunch(MSP_codes.MSP_SET_ADVANCED_TUNING));
                }).then(function() {
                    if (TABS.pid_tuning.controllerChanged) { Promise.reject('pid controller changed'); }
                    if (CONFIG.flightControllerIdentifier == "BTFL" && semver.gte(CONFIG.flightControllerVersion, "2.8.1")) {
                        return MSP.promise(MSP_codes.MSP_SET_FILTER_CONFIG, MSP.crunch(MSP_codes.MSP_SET_FILTER_CONFIG));
                    }
                }).then(function() {
                    return MSP.promise(MSP_codes.MSP_SET_RC_TUNING, MSP.crunch(MSP_codes.MSP_SET_RC_TUNING));
                }).then(function() {
                    return MSP.promise(MSP_codes.MSP_EEPROM_WRITE);
                }).then(function() {
                    GUI.log(chrome.i18n.getMessage('pidTuningEepromSaved'));
                });
            }
        });

        // Setup model for rates preview
        self.initRatesPreview();
        self.renderModel();

        // enable RC data pulling for rates preview
        GUI.interval_add('receiver_pull', function() { MSP.send_message(MSP_codes.MSP_RC) }, true);

        // setup curves
        self.curves = [
            new ExpoChart('roll'),
            new ExpoChart('yaw')
        ];

        GUI.content_ready(callback);
    }

};

TABS.pid_tuning.initRatesPreview = function () {
    this.keepRendering = true;
    this.model = new Model($('.rates_preview'), $('.rates_preview canvas'));

    var scale = d3.scale.linear().domain([900, 2100]);

    this.rollScale = scale.range([Math.PI * 2, -Math.PI * 2]);
    this.pitchScale = scale.range([Math.PI * 2, -Math.PI * 2]);
    this.yawScale = scale.range([Math.PI * 2, -Math.PI * 2]);

    $(window).on('resize', $.proxy(this.model.resize, this.model));
};

TABS.pid_tuning.renderModel = function () {
    var self = this;

    if (this.keepRendering) { requestAnimationFrame(this.renderModel.bind(this)); }

    if (!this.clock) { this.clock = new THREE.Clock(); }

    if (RC.channels[0] && RC.channels[1] && RC.channels[2]) {
        var delta = this.clock.getDelta(),
            roll  = delta * this.rollScale(RC.channels[0]),
            pitch = delta * this.pitchScale(RC.channels[1]),
            yaw   = delta * this.yawScale(RC.channels[2]);

        this.model.rotateBy(pitch, yaw, roll);
        // draw the curves
        _.map(self.curves, function(curve) { curve.refresh(); });
    }
};

/* Wrap whole function in an independant class */

function ExpoChart(axisName) {

    var self = this;
    var rcCommandMaxDegS, rcCommandMinDegS;
    var canvasHeightScale;

    var fontFace        = " 'open_sansregular', 'Segoe UI', Tahoma, sans-serif";
    var stickColor      = "rgba(255,102,102,1.0)";
    var expoCurveColor  = "rgba(0,0,255,0.5)";
    var axisColor       = "rgba(0,0,255,0.5)";
    var axisLabelColor  = "rgba(0,0,0,0.9)";

    self.axisName = axisName;
    self.$el = $('.' + axisName + '_curve');
    self.canvas = self.$el.find('canvas').get(0);
    if (!self.$el.length || !self.canvas) {
      throw 'cannot find curve element or canvas for ' + axisName;
    }
    self.rcData = function() { return RC.channels[parseInt(self.$el.data('rc-channel'))] };
    self.rcRate = function() { return parseFloat($('input[name="rc_rate"]').val()) * 100 };
    self.axisRate = function() { return parseFloat($('.pid_tuning input[name="'+axisName+'_rate"]').val()) };
    self.expo = function() { return parseFloat($('input[name="rc_expo"]').val()) * 100 };
    self.deadband = function() { return RC_deadband.deadband };
    self.midrc = function() { return RX_CONFIG.midrc };
    self.superExpoActive = function() { return bit_check(BF_CONFIG.features, 23) };

    function constrain(value, min, max) {
        return Math.max(min, Math.min(value, max));
    }

    function rcLookup() {
        var tmpf = tmp / 100.0;
        return ;
    }

    var rcCommand = function(rcData) {
        var tmp = Math.min(Math.abs(rcData - self.midrc()), 500);
        (tmp > self.deadband()) ? (tmp -= self.deadband()):(tmp = 0);
        var tmpf = tmp / 100.0;
        return (((rcData < self.midrc())?-1:1) * ((2500.0 + self.expo() * (tmpf * tmpf - 25.0)) * tmpf * (self.rcRate()) / 2500.0)).toFixed(0);
    };

    var rcCommandMax = function () {
        return rcCommand(2000);
    };

    var rcCommandMin = function () {
        return rcCommand(1000);
    };

    var rcCommandRawToDegreesPerSecond = function(value) {
      var calculateRate = function(value) {
          var angleRate;

          if (self.superExpoActive()) {
              var rcFactor = (Math.abs(value) / (500.0 * (self.rcRate()) / 100.0));
              rcFactor = 1.0 / (constrain(1.0 - (rcFactor * (self.axisRate() / 100.0)), 0.01, 1.00));

              angleRate = rcFactor * ((27 * value) / 16.0);
          } else {
              angleRate = ((self.axisRate() + 27) * value) / 16.0;
          }

          return constrain(angleRate, -8190.0, 8190.0); // Rate limit protection
      };

      return calculateRate(value) >> 2; // the shift by 2 is to counterbalance the divide by 4 that occurs on the gyro to calculate the error

    };

    function calculateDrawingParameters() {

        self.fontHeight = self.fontHeight || constrain(self.canvas.height / 15, 20, 40);
        self.fontFace   = self.fontFace || (self.fontHeight + 'px ' + fontFace);

        rcCommandMaxDegS = rcCommandRawToDegreesPerSecond(rcCommandMax()) + " deg/s";
        rcCommandMinDegS = rcCommandRawToDegreesPerSecond(rcCommandMin()) + " deg/s";

        canvasHeightScale = self.canvas.height / Math.abs(rcCommandRawToDegreesPerSecond(rcCommandMax()) - rcCommandRawToDegreesPerSecond(rcCommandMin()));

    };

     var ctx = self.canvas.getContext("2d");
     ctx.translate(0.5, 0.5);

    //Draw an origin line for a graph (at the origin and spanning the window)
    function drawAxisLines() {
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;

        // Horizontal
        ctx.beginPath();
        ctx.moveTo(-self.canvas.width/2, 0);
        ctx.lineTo( self.canvas.width/2, 0);
        ctx.stroke();

        // Vertical
        ctx.beginPath();
        ctx.moveTo(0, -self.canvas.height/2);
        ctx.lineTo(0, self.canvas.height/2);
        ctx.stroke();

    }

    function plotExpoCurve() {

        ctx.save();
        ctx.strokeStyle = expoCurveColor;
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(-500, -self.canvasHeightScale * rcCommandRawToDegreesPerSecond(rcCommand(1000)));
        for(var i = 1001; i < 2000; i++) {
            ctx.lineTo(self.rcData()-self.midrc(), -self.canvasHeightScale * rcCommandRawToDegreesPerSecond(rcCommand(i)));
        }
        ctx.stroke();
        ctx.restore();
    }

    function plotStickPosition() {
        ctx.save();

        ctx.beginPath();
        ctx.fillStyle = stickColor;
        ctx.arc(self.rcData()-self.midrc(), -self.canvasHeightScale * rcCommandRawToDegreesPerSecond(rcCommand(self.rcData())), self.canvas.height / 40, 0, 2 * Math.PI);
        ctx.fill();


        ctx.restore();

    }

    function drawAxisLabel(axisLabel, x, y, align) {
        ctx.font = self.fontFace;
        ctx.fillStyle = axisLabelColor;
        if(align!=null) {
            ctx.textAlign = align;
        } else {
            ctx.textAlign = 'center';
        }

        ctx.fillText(axisLabel, x, y);
    }

    function drawAxisLabels() {

        drawAxisLabel(rcCommandMaxDegS, 0, 0 + self.fontHeight * 1.5, 'left');
        drawAxisLabel(rcCommandRawToDegreesPerSecond(rcCommand(self.rcData())) + " deg/s", 0,self.canvas.height/2 + self.fontHeight/2, 'left');

        drawAxisLabel('1000', 0, self.canvas.height, 'left');
        drawAxisLabel('2000', self.canvas.width, self.canvas.height, 'right');
        drawAxisLabel(self.midrc(), self.canvas.width/2, self.canvas.height, 'center');

    }

    // Public Functions
    this.refresh = function() {
        calculateDrawingParameters();
        ctx.save();
        ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
        ctx.translate(self.canvas.width/2, self.canvas.height/2);
        drawAxisLines();
        plotExpoCurve();
        plotStickPosition();
        ctx.restore();
        drawAxisLabels();
    }

    // Initialisation Code
    // Set the canvas coordinate system to match the rcData/rcCommand outputs
    self.canvas.width = 1000;
    self.canvas.height = 1000;
};

TABS.pid_tuning.cleanup = function (callback) {
    $(window).off('resize', $.proxy(this.model.resize, this.model));

    this.keepRendering = false;

    if (callback) callback();
};
