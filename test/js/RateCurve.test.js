import { describe, expect, it } from "vitest";
import RateCurve from "../../src/js/RateCurve.js";
import FC from "../../src/js/fc.js";

function makeRateCurve() {
    return new RateCurve(false);
}

describe("RateCurve.constrain", () => {
    const rc = makeRateCurve();

    it("passes values within range through unchanged", () => {
        expect(rc.constrain(5, 0, 10)).toBe(5);
    });

    it("clamps values below the minimum", () => {
        expect(rc.constrain(-5, 0, 10)).toBe(0);
    });

    it("clamps values above the maximum", () => {
        expect(rc.constrain(15, 0, 10)).toBe(10);
    });
});

describe("RateCurve.rcCommand", () => {
    const rc = makeRateCurve();

    it("returns 0 at stick centre", () => {
        expect(rc.rcCommand(1500, 1, 0)).toBe(0);
    });

    it("scales positive deflection by rcRate", () => {
        expect(rc.rcCommand(1750, 1, 0)).toBe(250);
        expect(rc.rcCommand(1750, 2.5, 0)).toBe(625);
    });

    it("negates the result for deflection below centre", () => {
        expect(rc.rcCommand(1250, 1, 0)).toBe(-250);
    });

    it("clamps travel to +-500 at the stick extremes", () => {
        expect(rc.rcCommand(2000, 1, 0)).toBe(500);
        expect(rc.rcCommand(1000, 1, 0)).toBe(-500);
    });

    it("clamps travel to +-500 even for out-of-range rcData", () => {
        expect(rc.rcCommand(2500, 1, 0)).toBe(500);
        expect(rc.rcCommand(500, 1, 0)).toBe(-500);
    });

    it("scales beyond 500 when rcRate exceeds 1", () => {
        expect(rc.rcCommand(2000, 2.5, 0)).toBe(1250);
    });

    it("subtracts deadband from deflection before scaling", () => {
        expect(rc.rcCommand(1520, 1, 20)).toBe(0);
        expect(rc.rcCommand(1521, 1, 20)).toBe(1);
    });

    it("produces exactly 0 when deflection equals the deadband (below-centre side yields negative zero)", () => {
        expect(rc.rcCommand(1520, 1, 20)).toBe(0);
        expect(rc.rcCommand(1480, 1, 20)).toBe(-0);
    });

    it("produces exactly 0 when deflection is inside the deadband (below-centre side yields negative zero)", () => {
        expect(rc.rcCommand(1510, 1, 20)).toBe(0);
        expect(rc.rcCommand(1490, 1, 20)).toBe(-0);
    });

    it("is odd-symmetric around stick centre", () => {
        for (let offset = 0; offset <= 500; offset += 50) {
            expect(rc.rcCommand(midRcPlus(offset), 1.3, 10)).toBeCloseTo(-rc.rcCommand(midRcMinus(offset), 1.3, 10), 9);
        }
    });
});

function midRcPlus(offset) {
    return 1500 + offset;
}

function midRcMinus(offset) {
    return 1500 - offset;
}

describe("RateCurve.getBetaflightRates", () => {
    const rc = makeRateCurve();

    it.each([
        [-1, -666.6666666666666],
        [-0.5, -153.84615384615384],
        [-0.25, -60.60606060606061],
        [0, 0],
        [0.25, 60.60606060606061],
        [0.5, 153.84615384615384],
        [1, 666.6666666666666],
    ])("rate=0.7 rcRate=1.0 rcExpo=0 superExpo=true: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getBetaflightRates(rcCommandf, Math.abs(rcCommandf), 0.7, 1.0, 0, true, 1000)).toBeCloseTo(
            expected,
            9,
        );
    });

    it.each([
        [-1, -666.6666666666666],
        [-0.5, -113.46153846153845],
        [-0.25, -42.70833333333333],
        [0, 0],
        [0.25, 42.70833333333333],
        [0.5, 113.46153846153845],
        [1, 666.6666666666666],
    ])("rate=0.7 rcRate=1.0 rcExpo=0.3 superExpo=true: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getBetaflightRates(rcCommandf, Math.abs(rcCommandf), 0.7, 1.0, 0.3, true, 1000)).toBeCloseTo(
            expected,
            9,
        );
    });

    it.each([
        [-1, -1.478658536585366],
        [-0.5, -0.739329268292683],
        [-0.25, -0.3696646341463415],
        [0, 0],
        [0.25, 0.3696646341463415],
        [0.5, 0.739329268292683],
        [1, 1.478658536585366],
    ])(
        "superExpoActive=false uses the legacy (rate*100+27)/16/4.1 formula: rcCommandf=%f -> %f",
        (rcCommandf, expected) => {
            expect(rc.getBetaflightRates(rcCommandf, Math.abs(rcCommandf), 0.7, 1.0, 0, false, 1000)).toBeCloseTo(
                expected,
                9,
            );
        },
    );

    it.each([
        [-1, -5000],
        [-0.5, -1503.0769230769229],
        [-0.25, -592.1212121212121],
        [0, 0],
        [0.25, 592.1212121212121],
        [0.5, 1503.0769230769229],
        [1, 5000],
    ])("rcRate > 2 applies the rcRate + (rcRate-2)*14.54 boost: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getBetaflightRates(rcCommandf, Math.abs(rcCommandf), 0.7, 2.5, 0, true, 5000)).toBeCloseTo(
            expected,
            9,
        );
    });

    it("clamps the result to +-limit", () => {
        expect(rc.getBetaflightRates(1, 1, 0.7, 2.5, 0, true, 1000)).toBe(1000);
        expect(rc.getBetaflightRates(1, 1, 0.7, 2.5, 0, true, 500)).toBe(500);
        expect(rc.getBetaflightRates(-1, 1, 0.7, 2.5, 0, true, 500)).toBe(-500);
    });

    it("guards the superExpo division at rate=1, full deflection (rcFactor floored via constrain to 100)", () => {
        expect(rc.getBetaflightRates(1, 1, 1.0, 1.0, 0, true, 99999)).toBe(20000);
        expect(rc.getBetaflightRates(1, 1, 0.999999, 1.0, 0, true, 99999)).toBe(20000);
    });

    it("is odd-symmetric around centre", () => {
        for (const rcCommandf of [0.1, 0.25, 0.5, 0.75, 1]) {
            const pos = rc.getBetaflightRates(rcCommandf, rcCommandf, 0.7, 1.3, 0.3, true, 1000);
            const neg = rc.getBetaflightRates(-rcCommandf, rcCommandf, 0.7, 1.3, 0.3, true, 1000);
            expect(neg).toBeCloseTo(-pos, 9);
        }
    });

    it("is monotonically increasing with deflection on the positive side", () => {
        let previous = -Infinity;
        for (const rcCommandf of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
            const value = rc.getBetaflightRates(rcCommandf, rcCommandf, 0.7, 1.3, 0.3, true, 1000);
            expect(value).toBeGreaterThan(previous);
            previous = value;
        }
    });
});

describe("RateCurve.getRaceflightRates", () => {
    const rc = makeRateCurve();

    it.each([
        [-1, -700],
        [-0.5, -300],
        [-0.25, -137.5],
        [0, 0],
        [0.25, 137.5],
        [0.5, 300],
        [1, 700],
    ])("rate=40 rcRate=500 rcExpo=0: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getRaceflightRates(rcCommandf, 40, 500, 0)).toBeCloseTo(expected, 9);
    });

    it.each([
        [-1, -700],
        [-0.5, -223.78125],
        [-0.25, -96.30126953125],
        [0, 0],
        [0.25, 96.30126953125],
        [0.5, 223.78125],
        [1, 700],
    ])("rate=40 rcRate=500 rcExpo=30: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getRaceflightRates(rcCommandf, 40, 500, 30)).toBeCloseTo(expected, 9);
    });

    it("is not clamped by any rate limit (function takes no limit parameter)", () => {
        expect(rc.getRaceflightRates(1, 255, 2000, 100)).toBeCloseTo(2000 + 2000 * 255 * 0.01, 6);
    });

    it("is odd-symmetric around centre", () => {
        for (const rcCommandf of [0.1, 0.25, 0.5, 0.75, 1]) {
            const pos = rc.getRaceflightRates(rcCommandf, 40, 500, 30);
            const neg = rc.getRaceflightRates(-rcCommandf, 40, 500, 30);
            expect(neg).toBeCloseTo(-pos, 9);
        }
    });
});

describe("RateCurve.getKISSRates", () => {
    const rc = makeRateCurve();

    it.each([
        [-1, -285.7142857142857],
        [-0.5, -117.64705882352942],
        [-0.25, -54.05405405405404],
        [0, 0],
        [0.25, 54.05405405405404],
        [0.5, 117.64705882352942],
        [1, 285.7142857142857],
    ])("rate=0.3 rcRate=1.0 rcExpo=0: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getKISSRates(rcCommandf, Math.abs(rcCommandf), 0.3, 1.0, 0)).toBeCloseTo(expected, 9);
    });

    it.each([
        [-1, -285.7142857142857],
        [-0.5, -91.17647058823529],
        [-0.25, -38.85135135135135],
        [0, 0],
        [0.25, 38.85135135135135],
        [0.5, 91.17647058823529],
        [1, 285.7142857142857],
    ])("rate=0.3 rcRate=1.0 rcExpo=0.3: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getKISSRates(rcCommandf, Math.abs(rcCommandf), 0.3, 1.0, 0.3)).toBeCloseTo(expected, 9);
    });

    it("is not clamped by any rate limit (function takes no limit parameter)", () => {
        expect(rc.getKISSRates(1, 1, 0.9, 2.0, 0)).toBeCloseTo(2000.0 * (1.0 / (1 - 0.9)) * (2.0 / 10), 6);
    });

    it("divides by zero (produces +-Infinity, unguarded) when rate=1 at full deflection", () => {
        expect(rc.getKISSRates(1, 1, 1, 1.0, 0)).toBe(Infinity);
        expect(rc.getKISSRates(-1, 1, 1, 1.0, 0)).toBe(-Infinity);
    });

    it("is odd-symmetric around centre", () => {
        for (const rcCommandf of [0.1, 0.25, 0.5, 0.75, 0.9]) {
            const pos = rc.getKISSRates(rcCommandf, rcCommandf, 0.3, 1.0, 0.3);
            const neg = rc.getKISSRates(-rcCommandf, rcCommandf, 0.3, 1.0, 0.3);
            expect(neg).toBeCloseTo(-pos, 9);
        }
    });
});

describe("RateCurve.getActualRates", () => {
    const rc = makeRateCurve();

    it.each([
        [-1, -200],
        [-0.5, -100],
        [-0.25, -50],
        [0, 0],
        [0.25, 50],
        [0.5, 100],
        [1, 200],
    ])(
        "rate=200 rcRate=200 rcExpo=0 (rate<=rcRate collapses to pure linear): rcCommandf=%f -> %f",
        (rcCommandf, expected) => {
            expect(rc.getActualRates(rcCommandf, Math.abs(rcCommandf), 200, 200, 0)).toBeCloseTo(expected, 9);
        },
    );

    it("rate<=rcRate collapses to a pure linear curve regardless of rcExpo", () => {
        expect(rc.getActualRates(0.5, 0.5, 200, 200, 0.9)).toBeCloseTo(100, 9);
    });

    it.each([
        [-1, -400],
        [-0.5, -126.5625],
        [-0.25, -56.2744140625],
        [0, 0],
        [0.25, 56.2744140625],
        [0.5, 126.5625],
        [1, 400],
    ])("rate=400 rcRate=200 rcExpo=0.5: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getActualRates(rcCommandf, Math.abs(rcCommandf), 400, 200, 0.5)).toBeCloseTo(expected, 9);
    });

    it("is not clamped by any rate limit (function takes no limit parameter)", () => {
        expect(rc.getActualRates(1, 1, 2000, 10, 0)).toBeCloseTo(10 + 1990, 6);
    });

    it("is odd-symmetric around centre", () => {
        for (const rcCommandf of [0.1, 0.25, 0.5, 0.75, 1]) {
            const pos = rc.getActualRates(rcCommandf, rcCommandf, 400, 200, 0.5);
            const neg = rc.getActualRates(-rcCommandf, rcCommandf, 400, 200, 0.5);
            expect(neg).toBeCloseTo(-pos, 9);
        }
    });
});

describe("RateCurve.getQuickRates", () => {
    const rc = makeRateCurve();

    it.each([
        [-1, -599.9999999999999],
        [-0.5, -149.99999999999997],
        [-0.25, -60],
        [0, 0],
        [0.25, 60],
        [0.5, 149.99999999999997],
        [1, 599.9999999999999],
    ])("rate=600 rcRate=1.0 rcExpo=0: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getQuickRates(rcCommandf, Math.abs(rcCommandf), 600, 1.0, 0)).toBeCloseTo(expected, 9);
    });

    it.each([
        [-1, -599.9999999999999],
        [-0.5, -134.8314606741573],
        [-0.25, -56.80473372781065],
        [0, 0],
        [0.25, 56.80473372781065],
        [0.5, 134.8314606741573],
        [1, 599.9999999999999],
    ])("rate=600 rcRate=1.0 rcExpo=0.3: rcCommandf=%f -> %f", (rcCommandf, expected) => {
        expect(rc.getQuickRates(rcCommandf, Math.abs(rcCommandf), 600, 1.0, 0.3)).toBeCloseTo(expected, 9);
    });

    it("forces rate up to rcRate*200 when the given rate is smaller, collapsing to a linear curve", () => {
        expect(rc.getQuickRates(0.5, 0.5, 100, 1.3, 0)).toBeCloseTo(0.5 * 1.3 * 200, 9);
    });

    it("is not clamped by any rate limit (function takes no limit parameter)", () => {
        expect(rc.getQuickRates(1, 1, 2000, 2.55, 0)).toBeGreaterThan(2.55 * 200);
    });

    it("is odd-symmetric around centre", () => {
        for (const rcCommandf of [0.1, 0.25, 0.5, 0.75, 1]) {
            const pos = rc.getQuickRates(rcCommandf, rcCommandf, 600, 1.0, 0.3);
            const neg = rc.getQuickRates(-rcCommandf, rcCommandf, 600, 1.0, 0.3);
            expect(neg).toBeCloseTo(-pos, 9);
        }
    });
});

describe("RateCurve.rcCommandRawToDegreesPerSecond", () => {
    const rc = makeRateCurve();

    it("returns undefined when rate, rcRate or rcExpo is undefined", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        expect(rc.rcCommandRawToDegreesPerSecond(2000, undefined, 1.0, 0, true, 0, 1000)).toBeUndefined();
        expect(rc.rcCommandRawToDegreesPerSecond(2000, 0.7, undefined, 0, true, 0, 1000)).toBeUndefined();
        expect(rc.rcCommandRawToDegreesPerSecond(2000, 0.7, 1.0, undefined, true, 0, 1000)).toBeUndefined();
    });

    it("dispatches to getBetaflightRates by default and applies the limit clamp", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        expect(rc.rcCommandRawToDegreesPerSecond(2000, 0.7, 1.0, 0, true, 0, 1000)).toBeCloseTo(666.6666666666666, 9);
        expect(rc.rcCommandRawToDegreesPerSecond(2000, 1.0, 1.0, 0, true, 0, 670)).toBe(670);
    });

    it("dispatches to getRaceflightRates and ignores the limit parameter entirely", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.RACEFLIGHT };
        expect(rc.rcCommandRawToDegreesPerSecond(2000, 40, 500, 0, false, 0, 1)).toBe(700);
    });

    it("dispatches to getKISSRates and ignores the limit parameter entirely", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.KISS };
        expect(rc.rcCommandRawToDegreesPerSecond(1750, 0.3, 1.0, 0, false, 0, 1)).toBeCloseTo(117.64705882352942, 9);
    });

    it("dispatches to getActualRates and ignores the limit parameter entirely", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.ACTUAL };
        expect(rc.rcCommandRawToDegreesPerSecond(1750, 400, 200, 0.5, false, 0, 1)).toBeCloseTo(126.5625, 9);
    });

    it("dispatches to getQuickRates and ignores the limit parameter entirely", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.QUICKRATES };
        expect(rc.rcCommandRawToDegreesPerSecond(1750, 100, 1.3, 0, false, 0, 1)).toBeCloseTo(130, 9);
    });

    it("subtracts the deadband before normalising rcCommandf", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        expect(rc.rcCommandRawToDegreesPerSecond(1520, 0.7, 1.0, 0, true, 20, 1000)).toBe(0);
        expect(rc.rcCommandRawToDegreesPerSecond(1510, 0.7, 1.0, 0, true, 20, 1000)).toBe(0);
    });
});

describe("RateCurve.getMaxAngularVel / setMaxAngularVel", () => {
    it("computes the degrees/sec at full deflection for the non-legacy curve", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        const rc = makeRateCurve();
        expect(rc.getMaxAngularVel(0.7, 1.0, 0, true, 0, 1000)).toBeCloseTo(666.6666666666666, 9);
    });

    it("returns undefined for the legacy curve (no maxAngularVel axis is drawn)", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        const legacyRc = new RateCurve(true);
        expect(legacyRc.getMaxAngularVel(0.7, 1.0, 0, true, 0, 1000)).toBeUndefined();
    });

    it("rounds up to the nearest 200", () => {
        const rc = makeRateCurve();
        expect(rc.setMaxAngularVel(670)).toBe(800);
        expect(rc.setMaxAngularVel(201)).toBe(400);
    });

    it("leaves an exact multiple of 200 unchanged", () => {
        const rc = makeRateCurve();
        expect(rc.setMaxAngularVel(200)).toBe(200);
    });

    it("maps 0 to 0", () => {
        const rc = makeRateCurve();
        expect(rc.setMaxAngularVel(0)).toBe(0);
    });
});

describe("RateCurve.getCurrentRates", () => {
    function baseRcTuning(ratesType) {
        return {
            roll_rate: 0.7,
            pitch_rate: 0.7,
            yaw_rate: 0.7,
            RC_RATE: 1.0,
            rcYawRate: 1.0,
            RC_EXPO: 0,
            RC_YAW_EXPO: 0,
            rcPitchRate: 1.0,
            RC_PITCH_EXPO: 0,
            roll_rate_limit: 1000,
            pitch_rate_limit: 1000,
            yaw_rate_limit: 1000,
            rates_type: ratesType,
        };
    }

    function setupFc(ratesType) {
        FC.RC_TUNING = baseRcTuning(ratesType);
        FC.FEATURE_CONFIG = { features: { isEnabled: () => false } };
        FC.RC_DEADBAND_CONFIG = { deadband: 5, yaw_deadband: 3 };
    }

    it("leaves rates unscaled for BETAFLIGHT", () => {
        setupFc(FC.RATES_TYPE.BETAFLIGHT);
        const rates = makeRateCurve().getCurrentRates();
        expect(rates.roll_rate).toBe(0.7);
        expect(rates.rc_rate).toBe(1.0);
        expect(rates.rc_expo).toBe(0);
    });

    it("scales rates by 100 and RC_RATE/expo by 1000/100 for RACEFLIGHT", () => {
        setupFc(FC.RATES_TYPE.RACEFLIGHT);
        const rates = makeRateCurve().getCurrentRates();
        expect(rates.roll_rate).toBe(70);
        expect(rates.pitch_rate).toBe(70);
        expect(rates.yaw_rate).toBe(70);
        expect(rates.rc_rate).toBe(1000);
        expect(rates.rc_rate_yaw).toBe(1000);
        expect(rates.rc_rate_pitch).toBe(1000);
        expect(rates.rc_expo).toBe(0);
    });

    it("scales rates and RC_RATE by 1000 for ACTUAL, leaving expo unscaled", () => {
        setupFc(FC.RATES_TYPE.ACTUAL);
        const rates = makeRateCurve().getCurrentRates();
        expect(rates.roll_rate).toBe(700);
        expect(rates.rc_rate).toBe(1000);
        expect(rates.rc_expo).toBe(0);
    });

    it("scales only rates (not rc_rate) by 1000 for QUICKRATES", () => {
        setupFc(FC.RATES_TYPE.QUICKRATES);
        const rates = makeRateCurve().getCurrentRates();
        expect(rates.roll_rate).toBe(700);
        expect(rates.pitch_rate).toBe(700);
        expect(rates.yaw_rate).toBe(700);
        expect(rates.rc_rate).toBe(1.0);
    });

    it("passes through the deadband configuration unchanged", () => {
        setupFc(FC.RATES_TYPE.BETAFLIGHT);
        const rates = makeRateCurve().getCurrentRates();
        expect(rates.deadband).toBe(5);
        expect(rates.yawDeadband).toBe(3);
    });

    it("always forces superexpo=true, overriding the SUPEREXPO_RATES feature flag", () => {
        setupFc(FC.RATES_TYPE.BETAFLIGHT);
        FC.FEATURE_CONFIG = { features: { isEnabled: () => false } };
        const rates = makeRateCurve().getCurrentRates();
        expect(rates.superexpo).toBe(true);
    });
});

describe("RateCurve.drawStickPosition return value", () => {
    function makeContext(height, { withEllipse = true, clientWidth, clientHeight } = {}) {
        const context = {
            save: () => {},
            restore: () => {},
            translate: () => {},
            beginPath: () => {},
            arcCalls: [],
            ellipseCalls: [],
            arc: (...args) => context.arcCalls.push(args),
            fill: () => {},
            fillStyle: undefined,
            canvas: { width: 200, height, clientWidth, clientHeight },
        };
        if (withEllipse) {
            context.ellipse = (...args) => context.ellipseCalls.push(args);
        }
        return context;
    }

    it("snaps to 0 when the computed rate is below 0.5 deg/s in magnitude", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        const rc = makeRateCurve();
        const context = makeContext(400);
        const result = rc.drawStickPosition(1500, 0.7, 1.0, 0, true, 0, 1000, 700, context);
        expect(result).toBe(0);
    });

    it("returns the rounded degrees/sec as a string otherwise", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        const rc = makeRateCurve();
        const context = makeContext(400);
        const result = rc.drawStickPosition(2000, 0.7, 1.0, 0, true, 0, 1000, 700, context);
        expect(result).toBe("667");
    });

    it("draws an aspect-compensated ellipse when the context supports it", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        const rc = makeRateCurve();
        const height = 400;
        const context = makeContext(height, { clientWidth: 800, clientHeight: 400 });
        rc.drawStickPosition(2000, 0.7, 1.0, 0, true, 0, 1000, 700, context);

        expect(context.arcCalls).toHaveLength(0);
        expect(context.ellipseCalls).toHaveLength(1);

        const radius = height / 60;
        const aspect = 400 / 800;
        const [x, , radiusX, radiusY] = context.ellipseCalls[0];
        // Horizontal radius is compressed by the display aspect ratio; vertical is not.
        expect(radiusX).toBeCloseTo(radius * aspect);
        expect(radiusY).toBeCloseTo(radius);
        expect(x).toBe(2000 - 1500);
    });

    it("uses a round ellipse when the display aspect ratio is unavailable", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        const rc = makeRateCurve();
        const context = makeContext(400); // no clientWidth/clientHeight
        rc.drawStickPosition(2000, 0.7, 1.0, 0, true, 0, 1000, 700, context);

        expect(context.ellipseCalls).toHaveLength(1);
        const [, , radiusX, radiusY] = context.ellipseCalls[0];
        expect(radiusX).toBe(radiusY);
    });

    it("falls back to arc when the context has no ellipse method", () => {
        FC.RC_TUNING = { rates_type: FC.RATES_TYPE.BETAFLIGHT };
        const rc = makeRateCurve();
        const context = makeContext(400, { withEllipse: false, clientWidth: 800, clientHeight: 400 });
        rc.drawStickPosition(2000, 0.7, 1.0, 0, true, 0, 1000, 700, context);

        expect(context.ellipse).toBeUndefined();
        expect(context.arcCalls).toHaveLength(1);
        const [, , radius] = context.arcCalls[0];
        expect(radius).toBeCloseTo(400 / 60);
    });
});
