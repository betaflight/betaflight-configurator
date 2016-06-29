'use strict';

TABS.pid_tuning = {
    controllerChanged: true
};

TABS.pid_tuning.initialize = function (callback) {
    var self = this;
    if (GUI.active_tab != 'pid_tuning') {
        GUI.active_tab = 'pid_tuning';
    }

    function get_pid_controller() {
        if (GUI.canChangePidController) {
            MSP.send_message(MSP_codes.MSP_PID_CONTROLLER, false, false, get_pid_names);
        } else {
            get_pid_names();
        }
    }

    function get_pid_names() {
        MSP.send_message(MSP_codes.MSP_PIDNAMES, false, false, get_pid_data);
    }

    function get_pid_data() {
        MSP.send_message(MSP_codes.MSP_PID, false, false, get_rc_tuning_data);
    }

    function get_rc_tuning_data() {
        MSP.send_message(MSP_codes.MSP_RC_TUNING, false, false, get_temp_data);
    }

    function get_temp_data() {
        MSP.send_message(MSP_codes.MSP_TEMPORARY_COMMANDS, false, false, get_filter_config);
    }

    function get_filter_config() {
        MSP.send_message(MSP_codes.MSP_FILTER_CONFIG, false, false, load_html);
    }

    function load_html() {
        $('#content').load("./tabs/pid_tuning.html", process_html);
    }

    // requesting MSP_STATUS manually because it contains CONFIG.profile
    MSP.send_message(MSP_codes.MSP_STATUS, false, false, get_pid_controller);

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
        $('.pid_tuning input[name="rc_rate_yaw"]').val(TEMPORARY_COMMANDS.RC_RATE_YAW.toFixed(2));

        $('.tpa input[name="tpa"]').val(RC_tuning.dynamic_THR_PID.toFixed(2));
        $('.tpa input[name="tpa-breakpoint"]').val(RC_tuning.dynamic_THR_breakpoint);

        if (semver.lt(CONFIG.apiVersion, "1.10.0")) {
            $('.pid_tuning input[name="rc_yaw_expo"]').hide();
            $('.pid_tuning input[name="rc_expo"]').attr("rowspan", "3");
        }

        $('.pid_tuning input[name="gyro_soft_lpf"]').val(FILTER_CONFIG.gyro_soft_lpf_hz);
        $('.pid_tuning input[name="dterm_lpf"]').val(FILTER_CONFIG.dterm_lpf_hz);
        $('.pid_tuning input[name="yaw_lpf"]').val(FILTER_CONFIG.yaw_lpf_hz);
        
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
		TEMPORARY_COMMANDS.RC_RATE_YAW = parseFloat($('.pid_tuning input[name="rc_rate_yaw"]').val());

        RC_tuning.dynamic_THR_PID = parseFloat($('.tpa input[name="tpa"]').val());
        RC_tuning.dynamic_THR_breakpoint = parseInt($('.tpa input[name="tpa-breakpoint"]').val());
		
		FILTER_CONFIG.gyro_soft_lpf_hz = parseInt($('.tpa input[name="gyro_soft_lpf"]').val());
		FILTER_CONFIG.dterm_lpf_hz = parseInt($('.tpa input[name="dterm_lpf"]').val());
		FILTER_CONFIG.yaw_lpf_hz = parseInt($('.tpa input[name="yaw_lpf"]').val());
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

        function drawRateCurve(rateElement, expoElement, canvasElement) {
            var rate = parseFloat(rateElement.val()),
                expo = parseFloat(expoElement.val()),
                context = canvasElement.getContext("2d");

            // local validation to deal with input event
            if (rate >= parseFloat(rateElement.prop('min')) &&
                rate <= parseFloat(rateElement.prop('max')) &&
                expo >= parseFloat(expoElement.prop('min')) &&
                expo <= parseFloat(expoElement.prop('max'))) {

                var rateHeight = canvasElement.height;
                var rateWidth = canvasElement.width;

                // math magic by englishman
                var ratey = rateHeight * rate;

                // draw
                context.clearRect(0, 0, rateWidth, rateHeight);
                context.beginPath();
                context.moveTo(0, rateHeight);
                context.quadraticCurveTo(rateWidth * 11 / 20, rateHeight - ((ratey / 2) * (1 - expo)), rateWidth, rateHeight - ratey);
                context.lineWidth = 2;
                context.strokeStyle = '#ffbb00';
                context.stroke();
            }
        }

		var rateElement = $('.pid_tuning input[name="rc_rate"]'),
			expoElement = $('.pid_tuning input[name="rc_expo"]'),
			yawExpoElement = $('.pid_tuning input[name="rc_yaw_expo"]'),
			rollRateElement = $('.pid_tuning input[name="roll_rate"]'),
			pitchRateElement = $('.pid_tuning input[name="pitch_rate"]'),
			yawRateElement = $('.pid_tuning input[name="yaw_rate"]'),
			rcCurveElement = $('.pitch_roll_curve canvas').get(0),
			rcYawCurveElement = $('.yaw_curve canvas').get(0);
			
    	var pitchRollCurve = new ExpoChart(rcCurveElement, 
    							 1500/*rcData*/, 
    							 parseFloat(expoElement.val()) * 100/*rcExpo*/, 
    							 parseFloat(rateElement.val()) * 100/*rcRate*/, 
    							 0/*deadband*/, 
    							 1500/*midrc*/, 
    							 parseFloat(rollRateElement.val()) * 100/*axisRate*/, 
    							 true/*superExpoActive*/);

    	var yawCurve = new ExpoChart(rcYawCurveElement, 
    							 1500/*rcData*/, 
    							 parseFloat(yawExpoElement.val()) * 100/*rcExpo*/, 
    							 100.0/*rcRate*/, 
    							 0/*deadband*/, 
    							 1500/*midrc*/, 
    							 parseFloat(yawRateElement.val()) * 100/*axisRate*/, 
    							 true/*superExpoActive*/);

        // UI Hooks
        // curves
        $('.pid_tuning').on('input change', function () {
            setTimeout(function () { // let global validation trigger and adjust the values first
				pitchRollCurve.refresh(1500 /*rcData*/, 
									   parseFloat(expoElement.val()) * 100/*rcExpo*/, 
									   parseFloat(rateElement.val()) * 100/*rcRate*/, 
									   0/*deadband*/, 
									   1500/*midrc*/, 
									   70/*axisRate*/, 
									   true/*superExpoActive*/);
				yawCurve.refresh(1500 /*rcData*/, 
									   parseFloat(yawExpoElement.val()) * 100/*rcExpo*/, 
									   100.0/*rcRate*/, 
									   0/*deadband*/, 
									   1500/*midrc*/, 
									   70/*axisRate*/, 
									   true/*superExpoActive*/);
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


        // update == save.
        $('a.update').click(function () {
            form_to_pid_and_rc();

            function send_pids() {
                if (!TABS.pid_tuning.controllerChanged) {
                    MSP.send_message(MSP_codes.MSP_SET_PID, MSP.crunch(MSP_codes.MSP_SET_PID), false, send_temporary);
                }
            }

            function send_temporary() {
                if (!TABS.pid_tuning.controllerChanged) {
                    MSP.send_message(MSP_codes.MSP_SET_TEMPORARY_COMMANDS, MSP.crunch(MSP_codes.MSP_SET_TEMPORARY_COMMANDS), false, send_rc_tuning_changes);
                }
            }

            /* Uncomment when HTML layout added
            function send_filters() {
                if (!TABS.pid_tuning.controllerChanged) {
                    MSP.send_message(MSP_codes.MSP_SET_FILTER_CONFIG, MSP.crunch(MSP_codes.MSP_SET_FILTER_CONFIG), false, send_rc_tuning_changes);
                }
            }*/

            function send_rc_tuning_changes() {
                MSP.send_message(MSP_codes.MSP_SET_RC_TUNING, MSP.crunch(MSP_codes.MSP_SET_RC_TUNING), false, save_to_eeprom);
            }

            function save_to_eeprom() {
                MSP.send_message(MSP_codes.MSP_EEPROM_WRITE, false, false, function () {
                    GUI.log(chrome.i18n.getMessage('pidTuningEepromSaved'));
                });
            }

            if (GUI.canChangePidController && TABS.pid_tuning.controllerChanged) {
                PID.controller = pidController_e.val();
                MSP.send_message(MSP_codes.MSP_SET_PID_CONTROLLER, MSP.crunch(MSP_codes.MSP_SET_PID_CONTROLLER), false, function () {
                    MSP.send_message(MSP_codes.MSP_EEPROM_WRITE, false, false, function () {
                        GUI.log(chrome.i18n.getMessage('pidTuningEepromSaved'));
                    });
                    TABS.pid_tuning.initialize();
                });
            } else {
                send_pids();
            }
        });

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSP_codes.MSP_STATUS);
        }, 250, true);

        GUI.content_ready(callback);
    }
};

TABS.pid_tuning.cleanup = function (callback) {
    if (callback) {
        callback();
    }
};

/* Wrap whole function in an independant class */

function ExpoChart(canvas, rcData, rcExpo, rcRate, deadband, midrc, axisRate, superExpoActive) {
	
	var fontHeight, fontFace;
	var rcCommandMaxDegS, rcCommandMinDegS;
	var canvasHeightScale;

	var DEFAULT_FONT_FACE = "pt Verdana, Arial, sans-serif";
	var stickColor 		  = "rgba(255,102,102,1.0)";  	// Betaflight Orange
	var expoCurveColor    = "rgba(0,0,255,0.5)";		// Blue
	var axisColor		  = "rgba(0,0,255,0.5)";		// Blue
	var axisLabelColor	  = "rgba(0,0,0,0.9)";			// Black

	function constrain(value, min, max) {
	    return Math.max(min, Math.min(value, max));
	}
	
	function rcLookup(tmp, expo, rate) {
	    var tmpf = tmp / 100.0;
	    return ((2500.0 + expo * (tmpf * tmpf - 25.0)) * tmpf * (rate) / 2500.0 );
	}
	
	var rcCommand = function(rcData, rate, expo) {
	        var tmp = Math.min(Math.abs(rcData - midrc), 500);
            (tmp > deadband) ? (tmp -= deadband):(tmp = 0);            
	        return (((rcData < midrc)?-1:1) * rcLookup(tmp, expo, rate)).toFixed(0);
	};
	
	var rcCommandMax = function () {
		return rcCommand(2000, rcRate, rcExpo);
	};

	var rcCommandMin = function () {
		return rcCommand(1000, rcRate, rcExpo);
	};

	var rcCommandRawToDegreesPerSecond = function(value, axisRate, superExpoActive) {

    var calculateRate = function(value) {
		var angleRate;

		if (superExpoActive) {
			var rcFactor = (Math.abs(value) / (500.0 * (rcRate) / 100.0));
			rcFactor = 1.0 / (constrain(1.0 - (rcFactor * (axisRate / 100.0)), 0.01, 1.00));

			angleRate = rcFactor * ((27 * value) / 16.0);
		} else {
			angleRate = ((axisRate + 27) * value) / 16.0;
		}

		return constrain(angleRate, -8190.0, 8190.0); // Rate limit protection
	};

	return calculateRate(value) >> 2; // the shift by 2 is to counterbalance the divide by 4 that occurs on the gyro to calculate the error       

	};

	function calculateDrawingParameters() {

		fontHeight = constrain(canvas.height / 15, 20, 40);
		fontFace   = fontHeight + DEFAULT_FONT_FACE;

		rcCommandMaxDegS = rcCommandRawToDegreesPerSecond(rcCommandMax(), axisRate, superExpoActive) + " deg/s";
		rcCommandMinDegS = rcCommandRawToDegreesPerSecond(rcCommandMin(), axisRate, superExpoActive) + " deg/s";
		
		canvasHeightScale = canvas.height / Math.abs(rcCommandRawToDegreesPerSecond(rcCommandMax(), axisRate, superExpoActive) - rcCommandRawToDegreesPerSecond(rcCommandMin(), axisRate, superExpoActive));
		
	};

	 var ctx = canvas.getContext("2d");
	 ctx.translate(0.5, 0.5);

    //Draw an origin line for a graph (at the origin and spanning the window)
    function drawAxisLines() {
        ctx.strokeStyle = axisColor;
        ctx.lineWidth = 1;

        // Horizontal
		ctx.beginPath();
        ctx.moveTo(-canvas.width/2, 0);
        ctx.lineTo( canvas.width/2, 0);        
        ctx.stroke();
        
        // Vertical
		ctx.beginPath();
        ctx.moveTo(0, -canvas.height/2);
        ctx.lineTo(0, canvas.height/2);        
        ctx.stroke();

    }
	 
	 function plotExpoCurve() {

		 ctx.save();
         ctx.strokeStyle = expoCurveColor;
         ctx.lineWidth = 3;

         ctx.beginPath();
         ctx.moveTo(-500, -canvasHeightScale * rcCommandRawToDegreesPerSecond(rcCommand(1000, rcRate, rcExpo), axisRate, superExpoActive));
         for(var rcData = 1001; rcData<2000; rcData++) {
        	ctx.lineTo(rcData-midrc, -canvasHeightScale * rcCommandRawToDegreesPerSecond(rcCommand(rcData, rcRate, rcExpo), axisRate, superExpoActive));
	 	 }
         ctx.stroke();
         ctx.restore();
	 }

	function plotStickPosition(rcData) {
		 ctx.save();

         ctx.beginPath();
         ctx.fillStyle = stickColor;
         ctx.arc(rcData-midrc, -canvasHeightScale * rcCommandRawToDegreesPerSecond(rcCommand(rcData, rcRate, rcExpo), axisRate, superExpoActive), canvas.height / 40, 0, 2 * Math.PI);
         ctx.fill();

         
         ctx.restore();
		
	}

    function drawAxisLabel(axisLabel, x, y, align) {
        ctx.font = fontFace;
        ctx.fillStyle = axisLabelColor;
        if(align!=null) {
            ctx.textAlign = align;
        } else {
            ctx.textAlign = 'center';
        }
        
        ctx.fillText(axisLabel, x, y);
    }

    function drawAxisLabels(rcData) {
    	
    	drawAxisLabel(rcCommandMaxDegS, 0, 0 + fontHeight * 1.5, 'left');
    	drawAxisLabel(rcCommandRawToDegreesPerSecond(rcCommand(rcData, rcRate, rcExpo), axisRate, superExpoActive) + " deg/s", 0,canvas.height/2 + fontHeight/2, 'left');   	

    	drawAxisLabel('1000', 0, canvas.height, 'left');
    	drawAxisLabel('2000', canvas.width, canvas.height, 'right');
    	drawAxisLabel(midrc, canvas.width/2, canvas.height, 'center');   	

    }
    
	// Public Functions
	this.refresh = function(rcData, rcExpo, rcRate, deadband, midrc, axisRate, superExpoActive){
		calculateDrawingParameters();

		ctx.save();
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.translate(canvas.width/2,canvas.height/2);	 
			drawAxisLines();
			plotExpoCurve();
			plotStickPosition(rcData);
		ctx.restore();
		drawAxisLabels(rcData);		
	}

    // Initialisation Code

	// Set the canvas coordinate system to match the rcData/rcCommand outputs
	canvas.width  = 1000; canvas.height=1000;

	var that = this;
	that.refresh(rcData, rcExpo, rcRate, deadband, midrc, axisRate, superExpoActive);
	

}
