'use strict';

TABS.gps = {};
TABS.gps.initialize = function (callback) {

    if (GUI.active_tab !== 'gps') {
        GUI.active_tab = 'gps';
    }

    function load_html() {
        $('#content').load("./tabs/gps.html", process_html);
    }

    MSP.send_message(MSPCodes.MSP_STATUS, false, false, load_html);

    function set_online(){
        $('#connect').hide();
        $('#waiting').show();
        $('#loadmap').hide();
    }

    function set_offline(){
        $('#connect').show();
        $('#waiting').hide();
        $('#loadmap').hide();
    }

    function process_html() {
        // translate to user-selected languageconsole.log('Online');
        i18n.localizePage();

        function get_raw_gps_data() {
            MSP.send_message(MSPCodes.MSP_RAW_GPS, false, false, get_comp_gps_data);
        }

        function get_comp_gps_data() {
            MSP.send_message(MSPCodes.MSP_COMP_GPS, false, false, get_gpsvinfo_data);
        }

        function get_gpsvinfo_data() {
            MSP.send_message(MSPCodes.MSP_GPS_SV_INFO, false, false, update_ui);
        }

        // To not flicker the divs while the fix is unstable
        let gpsWasFixed = false;

        function update_ui() {
            const lat = FC.GPS_DATA.lat / 10000000;
            const lon = FC.GPS_DATA.lon / 10000000;
            const url = `https://maps.google.com/?q=${lat},${lon}`;
            const gnssArray = ['GPS', 'SBAS', 'Galileo', 'BeiDou', 'IMES', 'QZSS', 'Glonass'];
            const qualityArray = ['gnssQualityNoSignal', 'gnssQualitySearching', 'gnssQualityAcquired', 'gnssQualityUnusable', 'gnssQualityLocked',
                'gnssQualityFullyLocked', 'gnssQualityFullyLocked', 'gnssQualityFullyLocked'];
            const usedArray = ['gnssUsedUnused', 'gnssUsedUsed'];
            const healthyArray = ['gnssHealthyUnknown', 'gnssHealthyHealthy', 'gnssHealthyUnhealthy', 'gnssHealthyUnknown'];
            let alt = FC.GPS_DATA.alt;
            if (semver.lt(FC.CONFIG.apiVersion, API_VERSION_1_39)) {
                alt = alt / 10;
            }

            $('.GPS_info td.fix').html((FC.GPS_DATA.fix) ? i18n.getMessage('gpsFixTrue') : i18n.getMessage('gpsFixFalse'));
            $('.GPS_info td.alt').text(`${alt} m`);
            $('.GPS_info td.lat a').prop('href', url).text(`${lat.toFixed(4)} deg`);
            $('.GPS_info td.lon a').prop('href', url).text(`${lon.toFixed(4)} deg`);
            $('.GPS_info td.speed').text(`${FC.GPS_DATA.speed} cm/s`);
            $('.GPS_info td.sats').text(FC.GPS_DATA.numSat);
            $('.GPS_info td.distToHome').text(`${FC.GPS_DATA.distanceToHome} m`);

            // Update GPS Signal Strengths
            const eSsTable = $('div.GPS_signal_strength table');

            eSsTable.html('');
            eSsTable.append(`
                <tr class="titles">
                    <td style="width: 12%;" i18n="gpsSignalGnssId">${i18n.getMessage('gpsSignalGnssId')}</td>
                    <td style="width: 10%;" i18n="gpsSignalSatId">${i18n.getMessage('gpsSignalSatId')}</td>
                    <td style="width: 25%;" i18n="gpsSignalStr">${i18n.getMessage('gpsSignalStr')}</td>
                    <td style="width: 53%;" i18n="gpsSignalStatusQly">${i18n.getMessage('gpsSignalStatusQly')}</td>
                </tr>
            `);
            if (FC.GPS_DATA.chn.length <= 16) {
                // Legacy code path: old BF firmware or old ublox module
                for (let i = 0; i < FC.GPS_DATA.chn.length; i++) {
                    eSsTable.append(`
                        <tr>
                            <td>-</td>
                            <td>${FC.GPS_DATA.svid[i]}</td>
                            <td><progress value="${FC.GPS_DATA.cno[i]}" max="99"></progress></td>
                            <td>${FC.GPS_DATA.quality[i]}</td>
                        </tr>
                    `);
                }
                // Cleanup the rest of the table
                for (let i = FC.GPS_DATA.chn.length; i < 32; i++) {
                    eSsTable.append(`
                        <tr>
                            <td>-</td>
                            <td>-</td>
                            <td><progress value="0" max="99"></progress></td>
                            <td> </td>
                        </tr>
                    `);
                }
            } else {
                // M8N/M9N on newer firmware

                const maxUIChannels = 32; //the list in html can only show 32 channels but future firmware could send more
                let channels = Math.min(maxUIChannels, FC.GPS_DATA.chn.length) || 32;

                for (let i = 0; i < channels; i++) {
                    let rowContent = '';
                    if (FC.GPS_DATA.chn[i] <= 6) {
                        rowContent += `<td>${gnssArray[FC.GPS_DATA.chn[i]]}</td>`;
                    } else {
                        rowContent += '<td>-</td>';
                    }

                    if (FC.GPS_DATA.chn[i] >= 7) {
                        rowContent += '<td>-</td>';
                        rowContent += `<td><progress value="${0}" max="99"></progress></td>`;
                        rowContent += `<td> </td>`;
                    } else {
                        rowContent += `<td>${FC.GPS_DATA.svid[i]}</td>`;
                        rowContent += `<td><progress value="${FC.GPS_DATA.cno[i]}" max="99"></progress></td>`;
                        const quality = i18n.getMessage(qualityArray[FC.GPS_DATA.quality[i] & 0x7]);
                        const used = i18n.getMessage(usedArray[(FC.GPS_DATA.quality[i] & 0x8) >> 3]);
                        const healthy = i18n.getMessage(healthyArray[(FC.GPS_DATA.quality[i] & 0x30) >> 4]);
                        rowContent += `<td>${quality} | ${used} | ${healthy}</td>`;
                    }
                    eSsTable.append(`<tr>${rowContent}</tr>`);
                }
            }

            const message = {
                action: 'center',
                lat: lat,
                lon: lon,
            };

            frame = document.getElementById('map');
            if (navigator.onLine) {
                $('#connect').hide();

                if (FC.GPS_DATA.fix) {
                   gpsWasFixed = true;
                   frame.contentWindow.postMessage(message, '*');
                   $('#loadmap').show();
                   $('#waiting').hide();
                } else if (!gpsWasFixed) {
                   $('#loadmap').hide();
                   $('#waiting').show();
                } else {
                    message.action = 'nofix';
                    frame.contentWindow.postMessage(message, '*');
                }
            }else{
                gpsWasFixed = false;
                $('#connect').show();
                $('#waiting').hide();
                $('#loadmap').hide();
            }
        }

        let frame = document.getElementById('map');

        // enable data pulling
        GUI.interval_add('gps_pull', function gps_update() {
            // avoid usage of the GPS commands until a GPS sensor is detected for targets that are compiled without GPS support.
            if (!have_sensor(FC.CONFIG.activeSensors, 'gps')) {
                //return;
            }

            get_raw_gps_data();
        }, 75, true);

        // status data pulled via separate timer with static speed
        GUI.interval_add('status_pull', function status_pull() {
            MSP.send_message(MSPCodes.MSP_STATUS);
        }, 250, true);


        //check for internet connection on load
        if (navigator.onLine) {
            console.log('Online');
            set_online();
        } else {
            console.log('Offline');
            set_offline();
        }

        $("#check").on('click',function(){
            if (navigator.onLine) {
                console.log('Online');
                set_online();
            } else {
                console.log('Offline');
                set_offline();
            }
        });

        $('#zoom_in').click(function() {
            console.log('zoom in');
            const message = {
                action: 'zoom_in',
            };
            frame.contentWindow.postMessage(message, '*');
        });

        $('#zoom_out').click(function() {
            console.log('zoom out');
            const message = {
                action: 'zoom_out',
            };
            frame.contentWindow.postMessage(message, '*');
        });

        GUI.content_ready(callback);
    }

};

TABS.gps.cleanup = function (callback) {
    if (callback) callback();
};
