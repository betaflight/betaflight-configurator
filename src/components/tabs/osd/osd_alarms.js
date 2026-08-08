export const OSD_CAPACITY_ALARM_KEY = "cap";

export function getVisibleAlarmEntries(alarms, hideCapacityAlarm = false) {
    if (!alarms || typeof alarms !== "object" || Array.isArray(alarms)) {
        return [];
    }

    return Object.entries(alarms)
        .filter(([key]) => !(hideCapacityAlarm && key === OSD_CAPACITY_ALARM_KEY))
        .map(([key, alarm]) => ({ key, alarm }));
}
