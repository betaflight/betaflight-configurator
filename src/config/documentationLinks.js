/**
 * Centralized documentation URLs for all tabs and components
 * This single source of truth prevents duplication and makes URL updates easier
 */

const BASE_DOCS_URL = "https://betaflight.com/docs/wiki/app/";

export const documentationLinks = {
    setup: `${BASE_DOCS_URL}setup-tab`,
    ports: `${BASE_DOCS_URL}ports-tab`,
    configuration: `${BASE_DOCS_URL}configuration-tab`,
    power: `${BASE_DOCS_URL}power-tab`,
    failsafe: `${BASE_DOCS_URL}failsafe-tab`,
    presets: `${BASE_DOCS_URL}presets-tab`,
    pid_tuning: `${BASE_DOCS_URL}pid-tuning-tab`,
    receiver: `${BASE_DOCS_URL}receiver-tab`,
    modes: `${BASE_DOCS_URL}auxiliary-tab`,
    adjustments: `${BASE_DOCS_URL}adjustments-tab`,
    servos: `${BASE_DOCS_URL}servos-tab`,
    gps: `${BASE_DOCS_URL}gps-tab`,
    motors: `${BASE_DOCS_URL}motors-tab`,
    osd: `${BASE_DOCS_URL}osd-tab`,
    vtx: `${BASE_DOCS_URL}vtx-tab`,
    transponder: `${BASE_DOCS_URL}transponder-tab`,
    ledstrip: `${BASE_DOCS_URL}ledstrip-tab`,
    sensors: `${BASE_DOCS_URL}sensors-tab`,
    logging: `${BASE_DOCS_URL}logging-tab`,
    blackbox: `${BASE_DOCS_URL}blackbox-tab`,
    cli: `${BASE_DOCS_URL}cli-tab`,
};

export default documentationLinks;
