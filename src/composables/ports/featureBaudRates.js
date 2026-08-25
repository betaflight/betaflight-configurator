/**
 * Baud rates each feature actually honours, as CLI lookup names.
 *
 * These are narrower than the ports tab's lists, which offered every rate the shared port table
 * could hold. From API 1.49 the rate belongs to the feature, so only the ones its driver acts on
 * are worth offering.
 */

// AUTO is deliberately absent: it matches no entry in the firmware's gpsInitData table, so gpsInit
// falls through to its first one and connects at 230400 without saying so.
export const GPS_BAUD_RATES = ["9600", "19200", "38400", "57600", "115200", "230400"];
