import { i18n } from "../localization";
import semver from 'semver';
import { API_VERSION_1_43 } from '../data_storage';
import GUI, { TABS } from '../gui';
import FC from '../fc';
import MSP from "../msp";
import MSPCodes from "../msp/MSPCodes";
import { gui_log } from '../gui_log';
import { have_sensor } from "../sensor_helpers";
import { mspHelper } from '../msp/MSPHelper';
import { reinitializeConnection } from '../serial_backend';
import { updateTabList } from '../utils/updateTabList';

const gps = {};

gps.initialize = async function (callback) {

    GUI.active_tab = 'gps';

    await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
    await MSP.promise(MSPCodes.MSP_GPS_CONFIG);

    const hasMag = have_sensor(FC.CONFIG.activeSensors, 'mag');

    load_html();

    function load_html() {
        $('#content').load("./tabs/gps.html", process_html);
    }

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
            MSP.send_message(MSPCodes.MSP_GPS_SV_INFO, false, false, hasMag ? get_imu_data : update_ui);
        }

        function get_imu_data() {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, update_ui);
        }

        // To not flicker the divs while the fix is unstable
        let gpsWasFixed = false;

        // GPS Configuration
        const features_e = $('.tab-gps .features');

        FC.FEATURE_CONFIG.features.generateElements(features_e);

        const checkUpdateGpsControls = () => $('.gpsSettings').toggle(FC.FEATURE_CONFIG.features.isEnabled('GPS'));

        $('input.feature', features_e).on('change', function () {
            const element = $(this);

            FC.FEATURE_CONFIG.features.updateData(element);
            updateTabList(FC.FEATURE_CONFIG.features);

            if (element.attr('name') === 'GPS') {
                checkUpdateGpsControls();
            }
        });

        checkUpdateGpsControls();

        // generate GPS
        const gpsProtocols = [
            'NMEA',
            'UBLOX',
            'MSP',
        ];

        const gpsBaudRates = [
            '115200',
            '57600',
            '38400',
            '19200',
            '9600',
        ];

        const gpsSbas = [
            i18n.getMessage('gpsSbasAutoDetect'),
            i18n.getMessage('gpsSbasEuropeanEGNOS'),
            i18n.getMessage('gpsSbasNorthAmericanWAAS'),
            i18n.getMessage('gpsSbasJapaneseMSAS'),
            i18n.getMessage('gpsSbasIndianGAGAN'),
        ];

        if (semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43)) {
            gpsSbas.push(i18n.getMessage('gpsSbasNone'));
        }

        const gpsProtocolElement = $('select.gps_protocol');
        const gpsAutoBaudElement = $('input[name="gps_auto_baud"]');
        const gpsAutoBaudGroup = $('.gps_auto_baud');
        const gpsAutoConfigElement = $('input[name="gps_auto_config"]');
        const gpsAutoConfigGroup = $('.gps_auto_config');
        const gpsUbloxGalileoElement = $('input[name="gps_ublox_galileo"]');
        const gpsUbloxGalileoGroup = $('.gps_ublox_galileo');
        const gpsUbloxSbasElement = $('select.gps_ubx_sbas');
        const gpsUbloxSbasGroup = $('.gps_ubx_sbas');
        const gpsHomeOnceElement = $('input[name="gps_home_once"]');
        const gpsBaudrateElement = $('select.gps_baudrate');

        for (let protocolIndex = 0; protocolIndex < gpsProtocols.length; protocolIndex++) {
            gpsProtocolElement.append(`<option value="${protocolIndex}">${gpsProtocols[protocolIndex]}</option>`);
        }

        gpsProtocolElement.change(function () {
            FC.GPS_CONFIG.provider = parseInt($(this).val());

            // Call this to enable or disable auto config elements depending on the protocol
            gpsAutoConfigElement.change();

        }).val(FC.GPS_CONFIG.provider).change();

        gpsAutoBaudElement.prop('checked', FC.GPS_CONFIG.auto_baud === 1);

        gpsAutoConfigElement.on('change', function () {
            const checked = $(this).is(":checked");

            const ubloxSelected = FC.GPS_CONFIG.provider === gpsProtocols.indexOf('UBLOX');
            const mspSelected = FC.GPS_CONFIG.provider === gpsProtocols.indexOf('MSP');

            const enableGalileoVisible = checked && ubloxSelected && semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43);
            gpsUbloxGalileoGroup.toggle(enableGalileoVisible);

            const enableSbasVisible = checked && ubloxSelected;
            gpsUbloxSbasGroup.toggle(enableSbasVisible);

            gpsAutoBaudGroup.toggle(ubloxSelected || mspSelected);
            gpsAutoConfigGroup.toggle(ubloxSelected || mspSelected);

        }).prop('checked', FC.GPS_CONFIG.auto_config === 1).trigger('change');

        gpsUbloxGalileoElement.change(function() {
            FC.GPS_CONFIG.ublox_use_galileo = $(this).is(':checked') ? 1 : 0;
        }).prop('checked', FC.GPS_CONFIG.ublox_use_galileo > 0).change();

        for (let sbasIndex = 0; sbasIndex < gpsSbas.length; sbasIndex++) {
            gpsUbloxSbasElement.append(`<option value="${sbasIndex}">${gpsSbas[sbasIndex]}</option>`);
        }

        gpsUbloxSbasElement.change(function () {
            FC.GPS_CONFIG.ublox_sbas = parseInt($(this).val());
        }).val(FC.GPS_CONFIG.ublox_sbas);

        $('.gps_home_once').toggle(semver.gte(FC.CONFIG.apiVersion, API_VERSION_1_43));
        gpsHomeOnceElement.change(function() {
            FC.GPS_CONFIG.home_point_once = $(this).is(':checked') ? 1 : 0;
        }).prop('checked', FC.GPS_CONFIG.home_point_once > 0).change();

        for (const baudRate of gpsBaudRates) {
            gpsBaudrateElement.append(`<option value="${baudRate}">${baudRate}</option>`);
        }

        gpsBaudrateElement.prop("disabled", true);
        gpsBaudrateElement.parent().hide();

        // End GPS Configuration

        function update_ui() {
            const lat = FC.GPS_DATA.lat / 10000000;
            const lon = FC.GPS_DATA.lon / 10000000;
            const url = `https://maps.google.com/?q=${lat},${lon}`;
            const heading = hasMag ? Math.atan2(FC.SENSOR_DATA.magnetometer[1], FC.SENSOR_DATA.magnetometer[0]) : undefined;
            const headingDeg = heading === undefined ? 0 : heading * 180 / Math.PI;
            const gnssArray = ['GPS', 'SBAS', 'Galileo', 'BeiDou', 'IMES', 'QZSS', 'Glonass'];
            const qualityArray = ['gnssQualityNoSignal', 'gnssQualitySearching', 'gnssQualityAcquired', 'gnssQualityUnusable', 'gnssQualityLocked',
                'gnssQualityFullyLocked', 'gnssQualityFullyLocked', 'gnssQualityFullyLocked'];
            const usedArray = ['gnssUsedUnused', 'gnssUsedUsed'];
            const healthyArray = ['gnssHealthyUnknown', 'gnssHealthyHealthy', 'gnssHealthyUnhealthy', 'gnssHealthyUnknown'];
            let alt = FC.GPS_DATA.alt;

            $('.GPS_info td.fix').text((FC.GPS_DATA.fix) ? i18n.getMessage('gpsFixTrue') : i18n.getMessage('gpsFixFalse'));
            $('.GPS_info td.fix').toggleClass("active", FC.GPS_DATA.fix !== 0);

            $('.GPS_info td.alt').text(`${alt} m`);
            $('.GPS_info td.lat a').prop('href', url).text(`${lat.toFixed(4)} deg`);
            $('.GPS_info td.lon a').prop('href', url).text(`${lon.toFixed(4)} deg`);
            $('.GPS_info td.heading').text(`${headingDeg.toFixed(4)} deg`);
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
                heading: heading,
            };

            frame = document.getElementById('map');
            if (navigator.onLine) {
                $('#connect').hide();

                if (FC.GPS_DATA.fix) {
                   gpsWasFixed = true;
                    if (!!frame.contentWindow) {
                        frame.contentWindow.postMessage(message, '*');
                    }
                   $('#loadmap').show();
                   $('#waiting').hide();
                } else if (!gpsWasFixed) {
                   $('#loadmap').hide();
                   $('#waiting').show();
                } else {
                    message.action = 'nofix';
                    if (!!frame.contentWindow) {
                        frame.contentWindow.postMessage(message, '*');
                    }
                }
            } else {
                gpsWasFixed = false;
                set_offline();
            }
        }

        let frame = document.getElementById('map');

        // enable data pulling
        GUI.interval_add('gps_pull', function gps_update() {
            get_raw_gps_data();
        }, 75, true);

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

        $('a.save').on('click', function() {
            // fill some data
            FC.GPS_CONFIG.auto_baud = $('input[name="gps_auto_baud"]').is(':checked') ? 1 : 0;
            FC.GPS_CONFIG.auto_config = $('input[name="gps_auto_config"]').is(':checked') ? 1 : 0;

            async function saveConfiguration() {
                await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));
                await MSP.promise(MSPCodes.MSP_SET_GPS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_GPS_CONFIG));
                await MSP.promise(MSPCodes.MSP_EEPROM_WRITE);
                reboot();
            }

            function reboot() {
                gui_log(i18n.getMessage('configurationEepromSaved'));

                GUI.tab_switch_cleanup(function() {
                    MSP.send_message(MSPCodes.MSP_SET_REBOOT, false, false, reinitializeConnection);
                });
            }

            saveConfiguration();
        });

        GUI.content_ready(callback);
    }
};

gps.cleanup = function (callback) {
    if (callback) callback();
};

TABS.gps = gps;
export {
    gps,
};
