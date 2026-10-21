// Motor datasheet values for the Motors tab (Advanced motor settings): picking a brand and a model fills in KV, stator
// size, magnet count and winding resistance. Collected from the manufacturers' published tables (source per entry).
// Brands are welcome to add and correct their own motors.
//
// What the motor thermal estimator needs, and how to measure it (0 = not published):
//   kv                  rpm per volt, as on the label
//   statorDiameterMm    stator diameter, mm (the first two digits of "2207")
//   statorHeightDmm     stator height, 0.1 mm (the last digits: 2207 -> 70, 2203.5 -> 35)
//   magnets             magnet count (the "P" of 12N14P); Betaflight's motor_poles
//   resistanceMohm      line-to-line winding resistance, mOhm, measured between two motor wires with a 4-wire meter or a
//                       current source (a plain multimeter reads high on 5" and larger motors: its leads are ~0.1-0.3 ohm)
//   idleCurrentA/V      no-load current and the voltage it was measured at (no prop)
//   weightG             motor weight without wires, g
//   thermal             winding temperature during the run (thermocouple or thermistor on the winding, read while the
//                       motor runs, not after it stops), with the throttle, prop, voltage, current, rpm, how long the
//                       motor ran at that throttle and the ambient air: ideally at idle, mid throttle and full throttle.
//                       Only points published as a winding / copper temperature are listed.

export interface MotorThermalPoint {
    throttlePct: number;
    prop: string;
    voltageV: number;
    currentA: number;
    rpm: number; // 0 = not published
    durationS: number; // 0 = not published
    ambientC: number; // 0 = not published
    windingC: number;
}

export interface MotorSpec {
    brand: string;
    model: string;
    kv: number;
    statorDiameterMm: number;
    statorHeightDmm: number;
    magnets: number;
    resistanceMohm: number;
    idleCurrentA: number;
    idleCurrentV: number;
    weightG: number;
    source: string;
    thermal?: MotorThermalPoint[];
}

// prettier-ignore
export const MOTOR_DATABASE: readonly MotorSpec[] = [
    { brand: "AMAX", model: "2207 Bando Competition", kv: 1850, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 37, source: "https://rcdrone.top/products/amax-2207-bando-competition-brushless-motor" },
    { brand: "AMAX", model: "2207 Bando Competition", kv: 1950, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 37, source: "https://rcdrone.top/products/amax-2207-bando-competition-brushless-motor" },
    { brand: "AMAX", model: "2207 Bando Competition", kv: 2150, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 37, source: "https://rcdrone.top/products/amax-2207-bando-competition-brushless-motor" },
    { brand: "AMAX", model: "2207 Bando Competition", kv: 2550, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 37, source: "https://rcdrone.top/products/amax-2207-bando-competition-brushless-motor" },
    { brand: "AMAX", model: "2207 Bando Competition", kv: 2750, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 37, source: "https://rcdrone.top/products/amax-2207-bando-competition-brushless-motor" },
    { brand: "Axisflying", model: "AE2207 V2", kv: 1860, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 73, idleCurrentA: 1.31, idleCurrentV: 10, weightG: 35.1, source: "https://www.racedayquads.com/products/in-progress-axisflying-ae2207-v2-2207-1860kv-motor" },
    { brand: "Axisflying", model: "AE2207 V2", kv: 1960, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 64, idleCurrentA: 0.95, idleCurrentV: 10, weightG: 35.2, source: "https://www.racedayquads.com/products/pre-order-axisflying-ae2207-v2-2207-1960kv-motor" },
    { brand: "Axisflying", model: "AE2505", kv: 1750, statorDiameterMm: 25, statorHeightDmm: 50, magnets: 14, resistanceMohm: 73, idleCurrentA: 1.27, idleCurrentV: 10, weightG: 37.2, source: "https://rcdrone.top/products/axisflying-ae2505-ae-series-motors-1750kv-2050kv-fpv-freestyle-motors" },
    { brand: "Axisflying", model: "AE2505", kv: 2050, statorDiameterMm: 25, statorHeightDmm: 50, magnets: 14, resistanceMohm: 54, idleCurrentA: 1.36, idleCurrentV: 10, weightG: 37.5, source: "https://rcdrone.top/products/axisflying-ae2505-ae-series-motors-1750kv-2050kv-fpv-freestyle-motors" },
    { brand: "BrotherHobby", model: "Avenger 2507 V2", kv: 1200, statorDiameterMm: 25, statorHeightDmm: 70, magnets: 14, resistanceMohm: 116, idleCurrentA: 0.68, idleCurrentV: 10, weightG: 40, source: "https://www.brotherhobby.com/avenger2507v2motor-p00131p1.html", thermal: [
        { throttlePct: 100, prop: "HQ7.0*3.5*3 Triblade", voltageV: 23.9, currentA: 33.4, rpm: 19308, durationS: 60, ambientC: 28, windingC: 112.3 },
    ] },
    { brand: "BrotherHobby", model: "Avenger 2507 V2", kv: 1750, statorDiameterMm: 25, statorHeightDmm: 70, magnets: 14, resistanceMohm: 49, idleCurrentA: 1.36, idleCurrentV: 10, weightG: 40, source: "https://www.brotherhobby.com/avenger2507v2motor-p00131p1.html", thermal: [
        { throttlePct: 100, prop: "HQ6.0*4.0*3 Triblade", voltageV: 19.8, currentA: 41.9, rpm: 26283, durationS: 60, ambientC: 28, windingC: 109.3 },
    ] },
    { brand: "BrotherHobby", model: "Avenger 2806.5", kv: 1300, statorDiameterMm: 28, statorHeightDmm: 65, magnets: 14, resistanceMohm: 64, idleCurrentA: 1.01, idleCurrentV: 10, weightG: 47.6, source: "https://www.brotherhobby.com/avenger-28065-motor-p00132p1.html", thermal: [
        { throttlePct: 100, prop: "HQ7.0*3.5 Triblade", voltageV: 23.8, currentA: 44.4, rpm: 21691, durationS: 10, ambientC: 28, windingC: 102.2 },
    ] },
    { brand: "BrotherHobby", model: "Avenger 2806.5", kv: 1700, statorDiameterMm: 28, statorHeightDmm: 65, magnets: 14, resistanceMohm: 44, idleCurrentA: 1.38, idleCurrentV: 10, weightG: 47.1, source: "https://www.brotherhobby.com/avenger-28065-motor-p00132p1.html", thermal: [
        { throttlePct: 100, prop: "HQ6*4*3 Triblade", voltageV: 23.8, currentA: 49.2, rpm: 29610, durationS: 10, ambientC: 28, windingC: 109.8 },
    ] },
    { brand: "BrotherHobby", model: "Avenger V2 2812", kv: 900, statorDiameterMm: 28, statorHeightDmm: 120, magnets: 14, resistanceMohm: 75, idleCurrentA: 1.15, idleCurrentV: 10, weightG: 80.8, source: "https://rcdrone.top/products/brotherhobby-avenger-2812-v2-motor", thermal: [
        { throttlePct: 100, prop: "HQ 9*5*3 Triblade", voltageV: 23.7, currentA: 49.2, rpm: 13990, durationS: 60, ambientC: 29.8, windingC: 121.5 },
        { throttlePct: 100, prop: "", voltageV: 23.8, currentA: 33.8, rpm: 16416, durationS: 60, ambientC: 29, windingC: 97.8 },
    ] },
    { brand: "BrotherHobby", model: "Avenger V2 2812", kv: 960, statorDiameterMm: 28, statorHeightDmm: 120, magnets: 14, resistanceMohm: 107, idleCurrentA: 1.1, idleCurrentV: 10, weightG: 83.6, source: "https://rcdrone.top/products/brotherhobby-avenger-2812-v2-motor", thermal: [
        { throttlePct: 100, prop: "HQ 8*4.5*3 Triblade", voltageV: 23.7, currentA: 49.2, rpm: 16372, durationS: 60, ambientC: 29.8, windingC: 111.5 },
    ] },
    { brand: "BrotherHobby", model: "Avenger V2 2812", kv: 1115, statorDiameterMm: 28, statorHeightDmm: 120, magnets: 14, resistanceMohm: 52, idleCurrentA: 1.46, idleCurrentV: 10, weightG: 79.2, source: "https://rcdrone.top/products/brotherhobby-avenger-2812-v2-motor", thermal: [
        { throttlePct: 100, prop: "9.0*4.7 CF Dualblade", voltageV: 23.7, currentA: 54.5, rpm: 18768, durationS: 60, ambientC: 31, windingC: 92.6 },
    ] },
    { brand: "BrotherHobby", model: "Avenger V2 2812", kv: 1500, statorDiameterMm: 28, statorHeightDmm: 120, magnets: 14, resistanceMohm: 26, idleCurrentA: 2.35, idleCurrentV: 10, weightG: 80.3, source: "https://rcdrone.top/products/brotherhobby-avenger-2812-v2-motor", thermal: [
        { throttlePct: 100, prop: "8.0*4.5 CF Dualblade", voltageV: 23.6, currentA: 80.1, rpm: 17938, durationS: 60, ambientC: 31, windingC: 102.5 },
    ] },
    { brand: "BrotherHobby", model: "LA 2005", kv: 1450, statorDiameterMm: 20, statorHeightDmm: 50, magnets: 14, resistanceMohm: 297, idleCurrentA: 0.5, idleCurrentV: 8, weightG: 20.4, source: "https://rcdrone.top/products/brotherhobby-la-2005-motor", thermal: [
        { throttlePct: 100, prop: "GF 51433 Triblade", voltageV: 24, currentA: 15, rpm: 23067, durationS: 120, ambientC: 26, windingC: 98.7 },
    ] },
    { brand: "BrotherHobby", model: "LA 2005", kv: 2450, statorDiameterMm: 20, statorHeightDmm: 50, magnets: 14, resistanceMohm: 114, idleCurrentA: 0.8, idleCurrentV: 8, weightG: 20.8, source: "https://rcdrone.top/products/brotherhobby-la-2005-motor", thermal: [
        { throttlePct: 100, prop: "GF 51433 Triblade", voltageV: 15.9, currentA: 28.8, rpm: 23551, durationS: 120, ambientC: 26, windingC: 104.5 },
    ] },
    { brand: "BrotherHobby", model: "LA 2005", kv: 2800, statorDiameterMm: 20, statorHeightDmm: 50, magnets: 14, resistanceMohm: 85, idleCurrentA: 1.2, idleCurrentV: 8, weightG: 21.1, source: "https://rcdrone.top/products/brotherhobby-la-2005-motor" },
    { brand: "BrotherHobby", model: "LA 2005", kv: 3450, statorDiameterMm: 20, statorHeightDmm: 50, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 0, source: "https://rcdrone.top/products/brotherhobby-la-2005-motor" },
    { brand: "BrotherHobby", model: "VY 1507", kv: 1550, statorDiameterMm: 15, statorHeightDmm: 70, magnets: 14, resistanceMohm: 497, idleCurrentA: 0.4, idleCurrentV: 10, weightG: 16.6, source: "https://www.brotherhobby.com/vy1507motor-p00174p1.html", thermal: [
        { throttlePct: 100, prop: "GF 5143*3 Triblade", voltageV: 24, currentA: 13.5, rpm: 20837, durationS: 120, ambientC: 29.7, windingC: 101.3 },
    ] },
    { brand: "BrotherHobby", model: "VY 1507", kv: 1900, statorDiameterMm: 15, statorHeightDmm: 70, magnets: 14, resistanceMohm: 297, idleCurrentA: 0.53, idleCurrentV: 10, weightG: 16.8, source: "https://www.brotherhobby.com/vy1507motor-p00174p1.html", thermal: [
        { throttlePct: 100, prop: "HQ 5141*3 Triblade", voltageV: 15.9, currentA: 14.9, rpm: 16963, durationS: 120, ambientC: 29.1, windingC: 93.4 },
    ] },
    { brand: "BrotherHobby", model: "VY 1507", kv: 3100, statorDiameterMm: 15, statorHeightDmm: 70, magnets: 14, resistanceMohm: 137, idleCurrentA: 0.74, idleCurrentV: 8, weightG: 16.3, source: "https://www.brotherhobby.com/vy1507motor-p00174p1.html", thermal: [
        { throttlePct: 100, prop: "HQ 3*4*3 Triblade", voltageV: 23.9, currentA: 27.4, rpm: 48120, durationS: 120, ambientC: 24, windingC: 87.6 },
    ] },
    { brand: "BrotherHobby", model: "VY 1507", kv: 4150, statorDiameterMm: 15, statorHeightDmm: 70, magnets: 14, resistanceMohm: 85, idleCurrentA: 1.03, idleCurrentV: 8, weightG: 16.3, source: "https://www.brotherhobby.com/vy1507motor-p00174p1.html", thermal: [
        { throttlePct: 100, prop: "HQ 3*4*3 Triblade", voltageV: 15.9, currentA: 29.6, rpm: 44104, durationS: 120, ambientC: 24, windingC: 84.9 },
    ] },
    { brand: "BrotherHobby", model: "VY 2004", kv: 1700, statorDiameterMm: 20, statorHeightDmm: 40, magnets: 14, resistanceMohm: 320, idleCurrentA: 0.41, idleCurrentV: 10, weightG: 15.7, source: "https://www.brotherhobby.com/vy-2004-motor-p00191p1.html", thermal: [
        { throttlePct: 100, prop: "GF T-mount 51*25*3 Triblade", voltageV: 24, currentA: 14.1, rpm: 26341, durationS: 120, ambientC: 27.8, windingC: 81.2 },
    ] },
    { brand: "BrotherHobby", model: "VY 2004", kv: 2100, statorDiameterMm: 20, statorHeightDmm: 40, magnets: 14, resistanceMohm: 190, idleCurrentA: 0.68, idleCurrentV: 10, weightG: 16.3, source: "https://www.brotherhobby.com/vy-2004-motor-p00191p1.html", thermal: [
        { throttlePct: 100, prop: "GF T-mount 51*25*3 Triblade", voltageV: 16, currentA: 13.4, rpm: 23990, durationS: 120, ambientC: 27.8, windingC: 70.4 },
    ] },
    { brand: "Diatone", model: "Mamba TOKA 1606", kv: 2700, statorDiameterMm: 16, statorHeightDmm: 60, magnets: 0, resistanceMohm: 164, idleCurrentA: 0.5, idleCurrentV: 10, weightG: 0, source: "https://buddyrc.com/products/diatone-mamba-toka-1606-2700kv-3100kv-3750kv-or-4300kv-brushless-motor" },
    { brand: "Diatone", model: "Mamba TOKA 2306.5", kv: 1700, statorDiameterMm: 23, statorHeightDmm: 60, magnets: 14, resistanceMohm: 77, idleCurrentA: 1.17, idleCurrentV: 10, weightG: 0, source: "https://www.buddyrc.com/products/diatone-mamba-toka-2306-5-1700kv-2450kv-or-2650kv-racing-motor" },
    { brand: "Diatone", model: "Mamba TOKA 2306.5", kv: 2450, statorDiameterMm: 23, statorHeightDmm: 60, magnets: 14, resistanceMohm: 52, idleCurrentA: 1.98, idleCurrentV: 10, weightG: 0, source: "https://www.buddyrc.com/products/diatone-mamba-toka-2306-5-1700kv-2450kv-or-2650kv-racing-motor" },
    { brand: "Diatone", model: "Mamba TOKA 2306.5", kv: 2650, statorDiameterMm: 23, statorHeightDmm: 60, magnets: 14, resistanceMohm: 38, idleCurrentA: 2.5, idleCurrentV: 10, weightG: 0, source: "https://www.buddyrc.com/products/diatone-mamba-toka-2306-5-1700kv-2450kv-or-2650kv-racing-motor" },
    { brand: "EMAX", model: "E3 1303", kv: 5000, statorDiameterMm: 13, statorHeightDmm: 30, magnets: 12, resistanceMohm: 310, idleCurrentA: 0.6, idleCurrentV: 8, weightG: 6.6, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1303" },
    { brand: "EMAX", model: "E3 1303", kv: 8000, statorDiameterMm: 13, statorHeightDmm: 30, magnets: 12, resistanceMohm: 125, idleCurrentA: 1.2, idleCurrentV: 6, weightG: 6.6, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1303" },
    { brand: "EMAX", model: "E3 1303", kv: 11000, statorDiameterMm: 13, statorHeightDmm: 30, magnets: 12, resistanceMohm: 77, idleCurrentA: 1.1, idleCurrentV: 5, weightG: 6.6, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1303" },
    { brand: "EMAX", model: "E3 1404", kv: 3700, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 238, idleCurrentA: 0.6, idleCurrentV: 10, weightG: 9.9, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1404" },
    { brand: "EMAX", model: "E3 1404", kv: 4800, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 157, idleCurrentA: 0.8, idleCurrentV: 8, weightG: 9.9, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1404" },
    { brand: "EMAX", model: "E3 1404", kv: 6000, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 103, idleCurrentA: 1, idleCurrentV: 7, weightG: 9.9, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1404" },
    { brand: "EMAX", model: "E3 1407", kv: 2800, statorDiameterMm: 14, statorHeightDmm: 70, magnets: 12, resistanceMohm: 190, idleCurrentA: 0.8, idleCurrentV: 10, weightG: 15.4, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1407" },
    { brand: "EMAX", model: "E3 1407", kv: 3300, statorDiameterMm: 14, statorHeightDmm: 70, magnets: 12, resistanceMohm: 143, idleCurrentA: 0.9, idleCurrentV: 10, weightG: 15.4, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1407" },
    { brand: "EMAX", model: "E3 1407", kv: 4100, statorDiameterMm: 14, statorHeightDmm: 70, magnets: 12, resistanceMohm: 98, idleCurrentA: 1.3, idleCurrentV: 10, weightG: 15.4, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-1407" },
    { brand: "EMAX", model: "E3 2812", kv: 920, statorDiameterMm: 28, statorHeightDmm: 120, magnets: 14, resistanceMohm: 66, idleCurrentA: 1.3, idleCurrentV: 10, weightG: 72, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-2812" },
    { brand: "EMAX", model: "E3 2812", kv: 1150, statorDiameterMm: 28, statorHeightDmm: 120, magnets: 14, resistanceMohm: 48, idleCurrentA: 1.6, idleCurrentV: 10, weightG: 72, source: "https://emaxmodel.com/motor-detail-dark.html?motor=e3-2812" },
    { brand: "Flywoo", model: "ROBO 1002", kv: 19800, statorDiameterMm: 10, statorHeightDmm: 20, magnets: 12, resistanceMohm: 89, idleCurrentA: 1.3, idleCurrentV: 5, weightG: 2.5, source: "https://rotorvillage.ca/flywoo-robo-1002-19800kv-1s-motor/" },
    { brand: "Flywoo", model: "ROBO 1002", kv: 23500, statorDiameterMm: 10, statorHeightDmm: 20, magnets: 12, resistanceMohm: 75, idleCurrentA: 1.5, idleCurrentV: 5, weightG: 2.5, source: "https://rotorvillage.ca/flywoo-robo-1002-23500kv-1s-motor/" },
    { brand: "GEPRC", model: "GEP-GR1106", kv: 4500, statorDiameterMm: 11, statorHeightDmm: 60, magnets: 12, resistanceMohm: 266, idleCurrentA: 0.6, idleCurrentV: 7.4, weightG: 7.1, source: "https://rcdrone.top/cdn/shop/files/geprc-gr1106-motor-product-title-summary-YYRb5.webp?v=1744515249" },
    { brand: "GEPRC", model: "GEP-GR1106", kv: 6000, statorDiameterMm: 11, statorHeightDmm: 60, magnets: 12, resistanceMohm: 170, idleCurrentA: 1.4, idleCurrentV: 6.4, weightG: 7.1, source: "https://rcdrone.top/cdn/shop/files/geprc-gr1106-motor-product-title-summary-YYRb5.webp?v=1744515249" },
    { brand: "GEPRC", model: "GEP-GR1106", kv: 7500, statorDiameterMm: 11, statorHeightDmm: 60, magnets: 12, resistanceMohm: 120, idleCurrentA: 1.6, idleCurrentV: 6.4, weightG: 7.1, source: "https://rcdrone.top/cdn/shop/files/geprc-gr1106-motor-product-title-summary-YYRb5.webp?v=1744515249" },
    { brand: "GEPRC", model: "GEP-GR1408", kv: 3500, statorDiameterMm: 14, statorHeightDmm: 80, magnets: 12, resistanceMohm: 98, idleCurrentA: 0.7, idleCurrentV: 10, weightG: 15.2, source: "https://geprc.com/product/gep-gr1408-3500kv/" },
    { brand: "GEPRC", model: "GEP-GR2306.5", kv: 1350, statorDiameterMm: 23, statorHeightDmm: 65, magnets: 14, resistanceMohm: 90, idleCurrentA: 0.8, idleCurrentV: 10, weightG: 31.5, source: "https://rcdrone.top/cdn/shop/files/H2e9f9c5df1094fac96902ecdf6cc6c01B.webp?v=1715306797" },
    { brand: "GEPRC", model: "GEP-GR2306.5", kv: 1850, statorDiameterMm: 23, statorHeightDmm: 65, magnets: 14, resistanceMohm: 58, idleCurrentA: 1.15, idleCurrentV: 10, weightG: 31.5, source: "https://rcdrone.top/cdn/shop/files/H7b179e25599a4ef7a44c216f09c54586i.webp?v=1715306821" },
    { brand: "GEPRC", model: "GEP-GR2306.5", kv: 2450, statorDiameterMm: 23, statorHeightDmm: 65, magnets: 14, resistanceMohm: 38, idleCurrentA: 1.95, idleCurrentV: 10, weightG: 31.5, source: "https://rcdrone.top/cdn/shop/files/H9a35002e6d984198ba00acbd9c8a6809v.webp?v=1715306845" },
    { brand: "GEPRC", model: "SPEEDX2 1202.5", kv: 10000, statorDiameterMm: 12, statorHeightDmm: 25, magnets: 12, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 4.5, source: "https://rcdrone.top/cdn/shop/files/GEPRC-SPEEDX2-1202-5-Motor-10000KV-15000KV-IKCGy.webp?v=1767443054" },
    { brand: "GEPRC", model: "SPEEDX2 1202.5", kv: 15000, statorDiameterMm: 12, statorHeightDmm: 25, magnets: 12, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 4.5, source: "https://rcdrone.top/cdn/shop/files/GEPRC-SPEEDX2-1202-5-Motor-10000KV-15000KV-IKCGy.webp?v=1767443054" },
    { brand: "GEPRC", model: "SPEEDX2 2806.5", kv: 1350, statorDiameterMm: 28, statorHeightDmm: 65, magnets: 14, resistanceMohm: 58, idleCurrentA: 1.25, idleCurrentV: 10, weightG: 48, source: "https://rcdrone.top/products/geprc-speedx2-2806-5-1350kv-1760kv-motor-1" },
    { brand: "GEPRC", model: "SPEEDX2 2806.5", kv: 1760, statorDiameterMm: 28, statorHeightDmm: 65, magnets: 14, resistanceMohm: 47, idleCurrentA: 1.7, idleCurrentV: 10, weightG: 48, source: "https://rcdrone.top/products/geprc-speedx2-2806-5-1350kv-1760kv-motor-1" },
    { brand: "GEPRC", model: "SPEEDX2 2809", kv: 1280, statorDiameterMm: 28, statorHeightDmm: 90, magnets: 14, resistanceMohm: 60, idleCurrentA: 0, idleCurrentV: 0, weightG: 60.1, source: "https://geprc.com/wp-content/uploads/2025/06/2809-1280KV-Datasheet.jpg" },
    { brand: "GEPRC", model: "SPEEDX2 2809 V1.1", kv: 1450, statorDiameterMm: 28, statorHeightDmm: 90, magnets: 14, resistanceMohm: 51, idleCurrentA: 0, idleCurrentV: 0, weightG: 60.1, source: "https://geprc.com/wp-content/uploads/2025/06/11.jpg" },
    { brand: "Happymodel", model: "EX1103", kv: 11000, statorDiameterMm: 11, statorHeightDmm: 30, magnets: 12, resistanceMohm: 0, idleCurrentA: 0.38, idleCurrentV: 2, weightG: 3.8, source: "https://www.happymodel.cn/index.php/2022/09/05/bassline-spare-part-ex1103-kv11000-brushless-motor/" },
    { brand: "iFlight", model: "XING 0803", kv: 17000, statorDiameterMm: 8, statorHeightDmm: 30, magnets: 12, resistanceMohm: 58, idleCurrentA: 0, idleCurrentV: 0, weightG: 2.1, source: "https://shop.iflight.com/XING-NANO-0803-FPV-NextGen-Motor-with-Plug-Pro1661" },
    { brand: "iFlight", model: "XING 1002", kv: 19000, statorDiameterMm: 10, statorHeightDmm: 20, magnets: 12, resistanceMohm: 86, idleCurrentA: 0, idleCurrentV: 0, weightG: 2.4, source: "https://shop.iflight.com/XING-1002-FPV-Motor-Pro1979" },
    { brand: "iFlight", model: "XING 1303", kv: 5000, statorDiameterMm: 13, statorHeightDmm: 30, magnets: 14, resistanceMohm: 386, idleCurrentA: 0, idleCurrentV: 0, weightG: 6.5, source: "https://shop.iflight.com/xing-1303-5000kv-fpv-micro-motor-pro1292" },
    { brand: "iFlight", model: "XING 2005", kv: 1900, statorDiameterMm: 20, statorHeightDmm: 50, magnets: 14, resistanceMohm: 125, idleCurrentA: 0, idleCurrentV: 0, weightG: 21, source: "https://shop.iflight.com/xing-2005-4-6s-fpv-motor-unibell-pro1381" },
    { brand: "iFlight", model: "XING 2806.5", kv: 1300, statorDiameterMm: 28, statorHeightDmm: 65, magnets: 14, resistanceMohm: 72, idleCurrentA: 0, idleCurrentV: 0, weightG: 54.3, source: "https://shop.iflight.com/xing-x2806-5-fpv-nextgen-motor-pro1001" },
    { brand: "iFlight", model: "XING 2814", kv: 1100, statorDiameterMm: 28, statorHeightDmm: 140, magnets: 14, resistanceMohm: 49, idleCurrentA: 0, idleCurrentV: 0, weightG: 88.3, source: "https://shop.iflight.com/xing-x2814-fpv-nextgen-motor-pro838" },
    { brand: "iFlight", model: "XING NANO 1204", kv: 4500, statorDiameterMm: 12, statorHeightDmm: 40, magnets: 12, resistanceMohm: 172, idleCurrentA: 0.68, idleCurrentV: 5.5, weightG: 6.4, source: "https://www.getfpv.com/iflight-xing-nano-x1204-4500kv-fpv-nextgen-micro-motor-black.html" },
    { brand: "iFlight", model: "XING NANO 1204", kv: 6500, statorDiameterMm: 12, statorHeightDmm: 40, magnets: 12, resistanceMohm: 108, idleCurrentA: 1.02, idleCurrentV: 5.5, weightG: 6.4, source: "https://www.getfpv.com/iflight-xing-nano-x1204-6500kv-fpv-nextgen-motor-1pc.html" },
    { brand: "iFlight", model: "XING-E Pro 2207", kv: 2450, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 47, idleCurrentA: 0, idleCurrentV: 0, weightG: 33.8, source: "https://shop.iflight.com/xing-e-pro-2207-2-6s-fpv-nextgen-motor-pro874" },
    { brand: "iFlight", model: "XING-E Pro 2306", kv: 1700, statorDiameterMm: 23, statorHeightDmm: 60, magnets: 14, resistanceMohm: 86, idleCurrentA: 0, idleCurrentV: 0, weightG: 33.8, source: "https://shop.iflight.com/XING-E-Pro-2306-4S-6S-FPV-Motor-pro1565" },
    { brand: "iFlight", model: "XING2 1404", kv: 3800, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 220, idleCurrentA: 0, idleCurrentV: 0, weightG: 9.1, source: "https://shop.iflight.com/xing2-1404-toothpick-ultralight-build-unibell-pro1482" },
    { brand: "iFlight", model: "XING2 1404", kv: 4600, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 159, idleCurrentA: 0, idleCurrentV: 0, weightG: 9.1, source: "https://shop.iflight.com/xing2-1404-toothpick-ultralight-build-unibell-pro1482" },
    { brand: "iFlight", model: "XING2 1806", kv: 2500, statorDiameterMm: 18, statorHeightDmm: 60, magnets: 14, resistanceMohm: 124, idleCurrentA: 0, idleCurrentV: 0, weightG: 20.2, source: "https://shop.iflight.com/xing2-1806-fpv-motor-1-5mm-shaft-pro1466" },
    { brand: "iFlight", model: "XING2 2207", kv: 1855, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 50, idleCurrentA: 0, idleCurrentV: 0, weightG: 31.6, source: "https://shop.iflight.com/xing2-2207-4s-6s-fpv-motor-unibell-pro1464" },
    { brand: "iFlight", model: "XING2 2809", kv: 1250, statorDiameterMm: 28, statorHeightDmm: 90, magnets: 14, resistanceMohm: 65, idleCurrentA: 0, idleCurrentV: 0, weightG: 60.7, source: "https://shop.iflight.com/XING2-2809-FPV-Motor-Unibell-Pro1673" },
    { brand: "RCinPower", model: "AOS Supernova 2207", kv: 1980, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 45, idleCurrentA: 1.1, idleCurrentV: 10, weightG: 31, source: "https://www.rcinpower.com/G-SERIES/61.html" },
    { brand: "RCinPower", model: "EX2807 Plus", kv: 1300, statorDiameterMm: 28, statorHeightDmm: 70, magnets: 14, resistanceMohm: 62, idleCurrentA: 1.2, idleCurrentV: 10, weightG: 48, source: "https://www.rcinpower.com/EX-STRIES/56.html" },
    { brand: "RCinPower", model: "GTS V2 1203", kv: 11500, statorDiameterMm: 12, statorHeightDmm: 30, magnets: 12, resistanceMohm: 100, idleCurrentA: 1.35, idleCurrentV: 10, weightG: 4.5, source: "https://www.rcinpower.com/G-SERIES/65.html" },
    { brand: "RCinPower", model: "GTS V3 0703", kv: 23000, statorDiameterMm: 7, statorHeightDmm: 30, magnets: 12, resistanceMohm: 206, idleCurrentA: 0.2, idleCurrentV: 5, weightG: 1.9, source: "https://www.rcinpower.com/G-SERIES/66.html" },
    { brand: "RCinPower", model: "GTS V3 0703", kv: 27000, statorDiameterMm: 7, statorHeightDmm: 30, magnets: 12, resistanceMohm: 175, idleCurrentA: 0.3, idleCurrentV: 5, weightG: 1.9, source: "https://www.rcinpower.com/G-SERIES/66.html" },
    { brand: "RCinPower", model: "GTS V3 0802", kv: 10000, statorDiameterMm: 8, statorHeightDmm: 20, magnets: 12, resistanceMohm: 500, idleCurrentA: 0.15, idleCurrentV: 5, weightG: 2, source: "https://www.rcinpower.com/G-SERIES/59.html" },
    { brand: "RCinPower", model: "GTS V3 0802", kv: 22000, statorDiameterMm: 8, statorHeightDmm: 20, magnets: 12, resistanceMohm: 117, idleCurrentA: 0.2, idleCurrentV: 5, weightG: 2, source: "https://www.rcinpower.com/G-SERIES/59.html" },
    { brand: "RCinPower", model: "GTS V3 0802", kv: 25000, statorDiameterMm: 8, statorHeightDmm: 20, magnets: 12, resistanceMohm: 105, idleCurrentA: 0.25, idleCurrentV: 5, weightG: 2, source: "https://www.rcinpower.com/G-SERIES/59.html" },
    { brand: "RCinPower", model: "GTS V3 0802", kv: 27000, statorDiameterMm: 8, statorHeightDmm: 20, magnets: 12, resistanceMohm: 95, idleCurrentA: 0.3, idleCurrentV: 5, weightG: 2, source: "https://www.rcinpower.com/G-SERIES/59.html" },
    { brand: "RCinPower", model: "GTS V3 1203", kv: 6000, statorDiameterMm: 12, statorHeightDmm: 30, magnets: 12, resistanceMohm: 320, idleCurrentA: 0.6, idleCurrentV: 10, weightG: 4.5, source: "https://www.rcinpower.com/G-SERIES/65.html" },
    { brand: "RCinPower", model: "GTS V3 1203", kv: 8000, statorDiameterMm: 12, statorHeightDmm: 30, magnets: 12, resistanceMohm: 167, idleCurrentA: 0.8, idleCurrentV: 10, weightG: 4.5, source: "https://www.rcinpower.com/G-SERIES/65.html" },
    { brand: "RCinPower", model: "Wasp Major V2 22.6-6.6", kv: 1980, statorDiameterMm: 23, statorHeightDmm: 66, magnets: 14, resistanceMohm: 56, idleCurrentA: 1.2, idleCurrentV: 10, weightG: 29.5, source: "https://www.rcinpower.com/G-SERIES/67.html" },
    { brand: "RCinPower", model: "Wasp Major V2 22.6-6.6", kv: 2100, statorDiameterMm: 23, statorHeightDmm: 66, magnets: 14, resistanceMohm: 52, idleCurrentA: 1.3, idleCurrentV: 10, weightG: 29.5, source: "https://www.rcinpower.com/G-SERIES/67.html" },
    { brand: "T-Motor", model: "2814SE", kv: 1100, statorDiameterMm: 28, statorHeightDmm: 140, magnets: 14, resistanceMohm: 24, idleCurrentA: 1.8, idleCurrentV: 10, weightG: 86, source: "https://www.ligpower.com/product/2814se-fpv-motor.html" },
    { brand: "T-Motor", model: "2816SE", kv: 800, statorDiameterMm: 28, statorHeightDmm: 160, magnets: 14, resistanceMohm: 47, idleCurrentA: 1.4, idleCurrentV: 10, weightG: 100, source: "https://www.ligpower.com/product/2816se-fpv-motor.html" },
    { brand: "T-Motor", model: "2816SE", kv: 1100, statorDiameterMm: 28, statorHeightDmm: 160, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 0, source: "https://www.ligpower.com/product/2816se-fpv-motor.html" },
    { brand: "T-Motor", model: "F1203", kv: 7000, statorDiameterMm: 12, statorHeightDmm: 30, magnets: 12, resistanceMohm: 198, idleCurrentA: 0.64, idleCurrentV: 10, weightG: 5.2, source: "https://www.ligpower.com/product/f1203-fpv-motor.html" },
    { brand: "T-Motor", model: "F1204", kv: 5000, statorDiameterMm: 12, statorHeightDmm: 40, magnets: 12, resistanceMohm: 240, idleCurrentA: 0.7, idleCurrentV: 10, weightG: 6.9, source: "https://www.ligpower.com/product/f1204-fpv-motor.html" },
    { brand: "T-Motor", model: "F1204", kv: 6500, statorDiameterMm: 12, statorHeightDmm: 40, magnets: 12, resistanceMohm: 140, idleCurrentA: 0.9, idleCurrentV: 10, weightG: 6.9, source: "https://www.ligpower.com/product/f1204-fpv-motor.html" },
    { brand: "T-Motor", model: "F1303", kv: 5000, statorDiameterMm: 13, statorHeightDmm: 30, magnets: 12, resistanceMohm: 280, idleCurrentA: 0.32, idleCurrentV: 4, weightG: 6.1, source: "https://www.ligpower.com/product/f1303-fpv-motor.html" },
    { brand: "T-Motor", model: "F1404", kv: 2900, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 310, idleCurrentA: 0.4, idleCurrentV: 10, weightG: 9.3, source: "https://www.ligpower.com/product/f1404-fpv-motor.html" },
    { brand: "T-Motor", model: "F1404", kv: 3800, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 195, idleCurrentA: 0.5, idleCurrentV: 10, weightG: 9.3, source: "https://www.ligpower.com/product/f1404-fpv-motor.html" },
    { brand: "T-Motor", model: "F1404", kv: 4600, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 138, idleCurrentA: 0.6, idleCurrentV: 10, weightG: 9.3, source: "https://www.ligpower.com/product/f1404-fpv-motor.html" },
    { brand: "T-Motor", model: "F1408", kv: 2800, statorDiameterMm: 14, statorHeightDmm: 80, magnets: 12, resistanceMohm: 141, idleCurrentA: 0.62, idleCurrentV: 10, weightG: 14.9, source: "https://www.ligpower.com/product/f1408-2-fpv-motor.html" },
    { brand: "T-Motor", model: "F1408", kv: 3950, statorDiameterMm: 14, statorHeightDmm: 80, magnets: 12, resistanceMohm: 88, idleCurrentA: 0.86, idleCurrentV: 10, weightG: 14.9, source: "https://www.ligpower.com/product/f1408-2-fpv-motor.html" },
    { brand: "T-Motor", model: "F2004", kv: 1700, statorDiameterMm: 20, statorHeightDmm: 40, magnets: 14, resistanceMohm: 221, idleCurrentA: 0.38, idleCurrentV: 10, weightG: 16.4, source: "https://www.ligpower.com/product/f2004-fpv-motor.html" },
    { brand: "T-Motor", model: "F2004", kv: 3000, statorDiameterMm: 20, statorHeightDmm: 40, magnets: 14, resistanceMohm: 90, idleCurrentA: 0.88, idleCurrentV: 10, weightG: 16.4, source: "https://www.ligpower.com/product/f2004-fpv-motor.html" },
    { brand: "T-Motor", model: "F2203.5", kv: 1500, statorDiameterMm: 22, statorHeightDmm: 35, magnets: 14, resistanceMohm: 235, idleCurrentA: 0.3, idleCurrentV: 10, weightG: 19.7, source: "https://www.ligpower.com/product/f2203_5-fpv-motor.html" },
    { brand: "T-Motor", model: "F2203.5", kv: 2850, statorDiameterMm: 22, statorHeightDmm: 35, magnets: 14, resistanceMohm: 90, idleCurrentA: 0.75, idleCurrentV: 10, weightG: 19.7, source: "https://www.ligpower.com/product/f2203_5-fpv-motor.html" },
    { brand: "T-Motor", model: "F2203.5", kv: 3550, statorDiameterMm: 22, statorHeightDmm: 35, magnets: 14, resistanceMohm: 76, idleCurrentA: 1.29, idleCurrentV: 10, weightG: 19.5, source: "https://www.ligpower.com/product/f2203_5-fpv-motor.html" },
    { brand: "T-Motor", model: "Pacer P22.6-7", kv: 1880, statorDiameterMm: 23, statorHeightDmm: 70, magnets: 14, resistanceMohm: 55, idleCurrentA: 1.1, idleCurrentV: 10, weightG: 36, source: "https://www.ligpower.com/product/p22-6-7-kv1880-fpv-motor.html" },
    { brand: "T-Motor", model: "Pacer P22.6-7", kv: 1980, statorDiameterMm: 23, statorHeightDmm: 70, magnets: 14, resistanceMohm: 50, idleCurrentA: 1.2, idleCurrentV: 10, weightG: 36.5, source: "https://www.ligpower.com/product/p22-6-7-kv1880-fpv-motor.html" },
    { brand: "T-Motor", model: "Pacer P2207 V2", kv: 1950, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 56, idleCurrentA: 1.1, idleCurrentV: 10, weightG: 33.7, source: "https://www.ligpower.com/product/p2207-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Pacer P2207 V2", kv: 2550, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 0, idleCurrentA: 0, idleCurrentV: 0, weightG: 0, source: "https://www.ligpower.com/product/p2207-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Pacer P2505", kv: 1850, statorDiameterMm: 25, statorHeightDmm: 50, magnets: 14, resistanceMohm: 69, idleCurrentA: 1.1, idleCurrentV: 10, weightG: 31.2, source: "https://www.ligpower.com/product/p2505-fpv-motor.html" },
    { brand: "T-Motor", model: "Pacer PV4 Juicy (P2406)", kv: 2060, statorDiameterMm: 24, statorHeightDmm: 60, magnets: 14, resistanceMohm: 45, idleCurrentA: 1.9, idleCurrentV: 10, weightG: 36, source: "https://www.ligpower.com/product/p2406-fpv-freestyle-motor.html" },
    { brand: "T-Motor", model: "Velox V2207 V2", kv: 1750, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 59, idleCurrentA: 1.1, idleCurrentV: 10, weightG: 35.1, source: "https://www.ligpower.com/product/v2207-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2207 V2", kv: 1950, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 50, idleCurrentA: 1.3, idleCurrentV: 10, weightG: 35.2, source: "https://www.ligpower.com/product/v2207-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2207 V2", kv: 2550, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 43, idleCurrentA: 1.9, idleCurrentV: 10, weightG: 34.3, source: "https://www.ligpower.com/product/v2207-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2207.5 V2", kv: 1750, statorDiameterMm: 22, statorHeightDmm: 75, magnets: 14, resistanceMohm: 74, idleCurrentA: 1.15, idleCurrentV: 10, weightG: 34.6, source: "https://www.ligpower.com/product/v2207_5-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2207.5 V2", kv: 1950, statorDiameterMm: 22, statorHeightDmm: 75, magnets: 14, resistanceMohm: 54, idleCurrentA: 1.42, idleCurrentV: 10, weightG: 35.3, source: "https://www.ligpower.com/product/v2207_5-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2207.5 V2", kv: 2550, statorDiameterMm: 22, statorHeightDmm: 75, magnets: 14, resistanceMohm: 41, idleCurrentA: 1.95, idleCurrentV: 10, weightG: 35.6, source: "https://www.ligpower.com/product/v2207_5-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2208 V2", kv: 1750, statorDiameterMm: 22, statorHeightDmm: 80, magnets: 14, resistanceMohm: 65, idleCurrentA: 1.35, idleCurrentV: 10, weightG: 36.9, source: "https://www.ligpower.com/product/v2208-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2208 V2", kv: 1950, statorDiameterMm: 22, statorHeightDmm: 80, magnets: 14, resistanceMohm: 52, idleCurrentA: 1.6, idleCurrentV: 10, weightG: 37.2, source: "https://www.ligpower.com/product/v2208-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2208 V2", kv: 2450, statorDiameterMm: 22, statorHeightDmm: 80, magnets: 14, resistanceMohm: 41, idleCurrentA: 2.1, idleCurrentV: 10, weightG: 37.2, source: "https://www.ligpower.com/product/v2208-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2306 V2", kv: 1950, statorDiameterMm: 23, statorHeightDmm: 60, magnets: 14, resistanceMohm: 64, idleCurrentA: 1.35, idleCurrentV: 10, weightG: 32, source: "https://www.ligpower.com/product/v2306-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2306 V2", kv: 2400, statorDiameterMm: 23, statorHeightDmm: 60, magnets: 14, resistanceMohm: 49, idleCurrentA: 1.85, idleCurrentV: 10, weightG: 32, source: "https://www.ligpower.com/product/v2306-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2306.5 V2", kv: 1950, statorDiameterMm: 23, statorHeightDmm: 65, magnets: 14, resistanceMohm: 67, idleCurrentA: 1.28, idleCurrentV: 10, weightG: 33.2, source: "https://www.ligpower.com/product/v2306_5-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2306.5 V2", kv: 2550, statorDiameterMm: 23, statorHeightDmm: 65, magnets: 14, resistanceMohm: 47, idleCurrentA: 1.72, idleCurrentV: 10, weightG: 33.8, source: "https://www.ligpower.com/product/v2306_5-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2307 V2", kv: 1950, statorDiameterMm: 23, statorHeightDmm: 70, magnets: 14, resistanceMohm: 67, idleCurrentA: 1.35, idleCurrentV: 10, weightG: 35.1, source: "https://www.ligpower.com/product/v2307-v2-fpv-motor.html" },
    { brand: "T-Motor", model: "Velox V2307 V2", kv: 2550, statorDiameterMm: 23, statorHeightDmm: 70, magnets: 14, resistanceMohm: 42, idleCurrentA: 2.1, idleCurrentV: 10, weightG: 35.5, source: "https://www.ligpower.com/product/v2307-v2-fpv-motor.html" },
    { brand: "VCI", model: "2207LT", kv: 2160, statorDiameterMm: 22, statorHeightDmm: 70, magnets: 14, resistanceMohm: 60, idleCurrentA: 0.7, idleCurrentV: 10, weightG: 30, source: "https://rcdrone.top/products/vci-2207-lt-2160kv-motor" },
    { brand: "VCI", model: "SPARK 08028", kv: 13500, statorDiameterMm: 8, statorHeightDmm: 28, magnets: 12, resistanceMohm: 375, idleCurrentA: 0.5, idleCurrentV: 4, weightG: 2.3, source: "https://rcdrone.top/products/vci-spark-08028-motor" },
    { brand: "VCI", model: "SPARK 08028", kv: 22000, statorDiameterMm: 8, statorHeightDmm: 28, magnets: 12, resistanceMohm: 145, idleCurrentA: 0.7, idleCurrentV: 4, weightG: 2.3, source: "https://rcdrone.top/products/vci-spark-08028-motor" },
    { brand: "VCI", model: "SPARK 08028", kv: 27000, statorDiameterMm: 8, statorHeightDmm: 28, magnets: 12, resistanceMohm: 105, idleCurrentA: 1, idleCurrentV: 2.8, weightG: 2.3, source: "https://rcdrone.top/products/vci-spark-08028-motor" },
    { brand: "VCI", model: "SPARK 1104", kv: 4600, statorDiameterMm: 11, statorHeightDmm: 40, magnets: 12, resistanceMohm: 380, idleCurrentA: 0.3, idleCurrentV: 10, weightG: 5.4, source: "https://rcdrone.top/products/vci-spark-1104-motor" },
    { brand: "VCI", model: "SPARK 1104", kv: 5400, statorDiameterMm: 11, statorHeightDmm: 40, magnets: 12, resistanceMohm: 310, idleCurrentA: 0.4, idleCurrentV: 10, weightG: 5.2, source: "https://rcdrone.top/products/vci-spark-1104-motor" },
    { brand: "VCI", model: "SPARK 1104", kv: 7100, statorDiameterMm: 11, statorHeightDmm: 40, magnets: 12, resistanceMohm: 200, idleCurrentA: 0.6, idleCurrentV: 10, weightG: 5.3, source: "https://rcdrone.top/products/vci-spark-1104-motor" },
    { brand: "VCI", model: "SPARK 1304", kv: 4000, statorDiameterMm: 13, statorHeightDmm: 40, magnets: 12, resistanceMohm: 325, idleCurrentA: 0.4, idleCurrentV: 10, weightG: 8.5, source: "https://rcdrone.top/products/vci-spark-1304-motor" },
    { brand: "VCI", model: "SPARK 1304", kv: 5000, statorDiameterMm: 13, statorHeightDmm: 40, magnets: 12, resistanceMohm: 205, idleCurrentA: 0.7, idleCurrentV: 10, weightG: 8.5, source: "https://rcdrone.top/products/vci-spark-1304-motor" },
    { brand: "VCI", model: "SPARK 1304", kv: 5400, statorDiameterMm: 13, statorHeightDmm: 40, magnets: 12, resistanceMohm: 175, idleCurrentA: 0.6, idleCurrentV: 10, weightG: 8.5, source: "https://rcdrone.top/products/vci-spark-1304-motor" },
    { brand: "VCI", model: "SPARK 1304", kv: 6800, statorDiameterMm: 13, statorHeightDmm: 40, magnets: 12, resistanceMohm: 114, idleCurrentA: 1, idleCurrentV: 10, weightG: 8.5, source: "https://rcdrone.top/products/vci-spark-1304-motor" },
    { brand: "VCI", model: "SPARK 1404", kv: 2450, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 420, idleCurrentA: 0.4, idleCurrentV: 10, weightG: 10.4, source: "https://rcdrone.top/products/vci-spark-1404-motor" },
    { brand: "VCI", model: "SPARK 1404", kv: 2750, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 325, idleCurrentA: 0.4, idleCurrentV: 10, weightG: 10.3, source: "https://rcdrone.top/products/vci-spark-1404-motor" },
    { brand: "VCI", model: "SPARK 1404", kv: 3750, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 220, idleCurrentA: 0.6, idleCurrentV: 10, weightG: 10.2, source: "https://rcdrone.top/products/vci-spark-1404-motor" },
    { brand: "VCI", model: "SPARK 1404", kv: 4000, statorDiameterMm: 14, statorHeightDmm: 40, magnets: 12, resistanceMohm: 190, idleCurrentA: 0.6, idleCurrentV: 10, weightG: 10.1, source: "https://rcdrone.top/products/vci-spark-1404-motor" },
    { brand: "X-NOVA", model: "Lightning V2 2203.5", kv: 1800, statorDiameterMm: 22, statorHeightDmm: 35, magnets: 14, resistanceMohm: 190, idleCurrentA: 0.7, idleCurrentV: 10, weightG: 20.5, source: "https://www.drone-fpv-racer.com/en/x-nova-lightning-v2-22035-1800kv-4pcs-11743.html" },
    { brand: "X-NOVA", model: "Lightning V2 2203.5", kv: 2400, statorDiameterMm: 22, statorHeightDmm: 35, magnets: 14, resistanceMohm: 105, idleCurrentA: 1, idleCurrentV: 10, weightG: 21, source: "https://www.drone-fpv-racer.com/en/brand/30-xnova" },
    { brand: "X-NOVA", model: "Lightning V2 2203.5", kv: 2800, statorDiameterMm: 22, statorHeightDmm: 35, magnets: 14, resistanceMohm: 70, idleCurrentA: 1.4, idleCurrentV: 10, weightG: 19, source: "https://www.drone-fpv-racer.com/en/x-nova-lightning-v2-22035-2800kv-motor-1pc-11386.html" },
];

// The brand for a motor that is not in the list: its values are entered by hand.
export const MOTOR_GENERIC = "Generic";

export function motorBrands(): string[] {
    return [MOTOR_GENERIC, ...[...new Set(MOTOR_DATABASE.map((m) => m.brand))].sort((a, b) => a.localeCompare(b))];
}

export function motorsOfBrand(brand: string): MotorSpec[] {
    return MOTOR_DATABASE.filter((m) => m.brand === brand);
}

export function motorLabel(m: MotorSpec): string {
    return `${m.model} ${m.kv}KV`;
}

// The entry the flight controller's values belong to: KV, stator and the datasheet resistance (written by picking the
// model) must all match, so a motor with the same KV and size from another brand is not taken for it. No match: null.
export function findMotor(
    kv: number,
    statorDiameterMm: number,
    statorHeightDmm: number,
    resistanceMohm: number,
): MotorSpec | null {
    const found = MOTOR_DATABASE.filter(
        (m) =>
            m.kv === kv &&
            m.statorDiameterMm === statorDiameterMm &&
            m.statorHeightDmm === statorHeightDmm &&
            m.resistanceMohm > 0 &&
            m.resistanceMohm === resistanceMohm,
    );
    return found.length === 1 ? found[0] : null;
}
