export const CHANNEL_MIN = 900;
export const CHANNEL_MAX = 2100;
const CHANNEL_MID = 1500;

export function clampChannel(value) {
    if (value === undefined || value === null || Number.isNaN(value)) {
        return CHANNEL_MID;
    }
    if (value < CHANNEL_MIN) {
        return CHANNEL_MIN;
    }
    if (value > CHANNEL_MAX) {
        return CHANNEL_MAX;
    }
    return value;
}

export function channelPercent(value) {
    const clamped = clampChannel(value);
    return ((clamped - CHANNEL_MIN) / (CHANNEL_MAX - CHANNEL_MIN)) * 100;
}
