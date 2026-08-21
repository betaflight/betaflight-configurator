/**
 * How the selected rangefinder and optical flow hardware actually talk to the FC, which is not one
 * answer and is not the same question as which sensor is enabled.
 *
 * The MT family (MTF01/02 and their P variants, and optical flow "MT") is handled by
 * rangefinder_lidarmt.c and arrives as MSP frames - MSP2_SENSOR_RANGEFINDER_LIDARMT and
 * MSP2_SENSOR_OPTICALFLOW_MT - so all those need is MSP enabled on the UART they are wired to.
 * There is no rangefinder function bit involved. TF, Nooploop and UPT1 open FUNCTION_LIDAR
 * directly. HCSR04 is pin-driven and needs no UART.
 *
 * Kept out of SensorsTab.vue so it can be tested against the hardware names firmware actually
 * reports: a firmware adding a sensor type has to be reflected here, and a test that re-derived
 * these rules would agree with itself rather than with the tab.
 */

/** @returns {"none"|"msp"|"serial"} */
export function rangefinderTransportFor(name) {
    if (!name || name === "NONE" || name === "HCSR04") {
        return "none";
    }
    return name.startsWith("MTF") ? "msp" : "serial";
}

/** @returns {"none"|"msp"|"serial"} */
export function opticalFlowTransportFor(name) {
    if (!name || name === "NONE") {
        return "none";
    }
    return name === "MT" ? "msp" : "serial";
}

/**
 * The transports both sensors need between them.
 *
 * Both are asked, because they are usually the same physical module on one wire and either one
 * alone is a valid setup - an MT optical flow sensor with no rangefinder still needs its MSP port.
 * Whichever transports are in play get a row; one module means one row serving both sensors.
 *
 * @returns {Set<"msp"|"serial">} empty when neither sensor needs a UART
 */
export function sensorTransportsFor(rangefinderName, opticalFlowName) {
    return new Set(
        [rangefinderTransportFor(rangefinderName), opticalFlowTransportFor(opticalFlowName)].filter(
            (t) => t !== "none",
        ),
    );
}
