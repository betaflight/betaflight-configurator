// Common refresh rate options used across all sensors
export const REFRESH_RATE_OPTIONS = [
    { value: 10, label: "10 ms" },
    { value: 20, label: "20 ms" },
    { value: 30, label: "30 ms" },
    { value: 40, label: "40 ms" },
    { value: 50, label: "50 ms" },
    { value: 100, label: "100 ms" },
    { value: 250, label: "250 ms" },
    { value: 500, label: "500 ms" },
    { value: 1000, label: "1000 ms" },
];

// Scale options for each sensor type
export const GYRO_SCALE_OPTIONS = [1, 2, 3, 4, 5, 10, 25, 50, 100, 200, 300, 400, 500, 1000, 2000];
export const ACCEL_SCALE_OPTIONS = [0.5, 1, 2];
export const MAG_SCALE_OPTIONS = [100, 200, 500, 1000, 2000, 5000, 10000];
