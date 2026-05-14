/*
 * Flight Indicators module (jQuery-free)
 * Based on jQuery Flight Indicators plugin by Sébastien Matton
 * Original: https://github.com/sebmatton/jQuery-Flight-Indicators
 * Published under GPLv3 License.
 */

const DEFAULTS = {
    size: 200,
    roll: 0,
    pitch: 0,
    turn: 0,
    heading: 0,
    vario: 0,
    airspeed: 0,
    altitude: 0,
    pressure: 1000,
    showBox: true,
    img_directory: "img/",
};

const CONSTANTS = {
    pitch_bound: 30,
    vario_bound: 1.95,
    airspeed_bound_l: 0,
    airspeed_bound_h: 160,
};

class FlightIndicator {
    constructor(selector, type, options) {
        this._el = typeof selector === "string" ? document.querySelector(selector) : selector;
        this._settings = { ...DEFAULTS, ...options };
        this._type = type;

        if (!this._el) {
            return;
        }
        this._build();
    }

    _build() {
        const s = this._settings;
        const d = s.img_directory;
        let html;

        switch (this._type) {
            case "heading":
                html = `<div class="instrument heading"><img src="${d}fi_box.svg" class="background box" alt="" /><div class="heading box"><img src="${d}heading_yaw.svg" class="box" alt="" /></div><div class="mechanics box"><img src="${d}heading_mechanics.svg" class="box" alt="" /><img src="${d}fi_circle.svg" class="box" alt="" /></div></div>`;
                break;
            case "variometer":
                html = `<div class="instrument vario"><img src="${d}fi_box.svg" class="background box" alt="" /><img src="${d}vertical_mechanics.svg" class="box" alt="" /><div class="vario box"><img src="${d}fi_needle.svg" class="box" alt="" /></div><div class="mechanics box"><img src="${d}fi_circle.svg" class="box" alt="" /></div></div>`;
                break;
            case "turn_coordinator":
                html = `<div class="instrument turn_coordinator"><img src="${d}fi_box.svg" class="background box" alt="" /><img src="${d}turn_coordinator.svg" class="box" alt="" /><div class="turn box"><img src="${d}fi_tc_airplane.svg" class="box" alt="" /></div><div class="mechanics box"><img src="${d}fi_circle.svg" class="box" alt="" /></div></div>`;
                break;
            case "airspeed":
                html = `<div class="instrument airspeed"><img src="${d}fi_box.svg" class="background box" alt="" /><img src="${d}speed_mechanics.svg" class="box" alt="" /><div class="speed box"><img src="${d}fi_needle.svg" class="box" alt="" /></div><div class="mechanics box"><img src="${d}fi_circle.svg" class="box" alt="" /></div></div>`;
                break;
            case "altimeter":
                html = `<div class="instrument altimeter"><img src="${d}fi_box.svg" class="background box" alt="" /><div class="pressure box"><img src="${d}altitude_pressure.svg" class="box" alt="" /></div><img src="${d}altitude_ticks.svg" class="box" alt="" /><div class="needleSmall box"><img src="${d}fi_needle_small.svg" class="box" alt="" /></div><div class="needle box"><img src="${d}fi_needle.svg" class="box" alt="" /></div><div class="mechanics box"><img src="${d}fi_circle.svg" class="box" alt="" /></div></div>`;
                break;
            default:
                // attitude
                html = `<div class="instrument attitude"><img src="${d}fi_box.svg" class="background box" alt="" /><div class="roll box"><img src="${d}horizon_back.svg" class="box" alt="" /><div class="pitch box"><img src="${d}horizon_ball.svg" class="box" alt="" /></div><img src="${d}horizon_circle.svg" class="box" alt="" /></div><div class="mechanics box"><img src="${d}horizon_mechanics.svg" class="box" alt="" /><img src="${d}fi_circle.svg" class="box" alt="" /></div></div>`;
                break;
        }

        this._el.innerHTML = html;

        const instrument = this._el.querySelector("div.instrument");
        if (instrument) {
            instrument.style.height = `${s.size}px`;
            instrument.style.width = `${s.size}px`;
        }

        const bg = this._el.querySelector("div.instrument img.box.background");
        if (bg) {
            bg.style.display = s.showBox ? "" : "none";
        }

        // Apply initial values
        switch (this._type) {
            case "heading":
                this.setHeading(s.heading);
                break;
            case "variometer":
                this.setVario(s.vario);
                break;
            case "turn_coordinator":
                this.setTurn(s.turn);
                break;
            case "airspeed":
                this.setAirSpeed(s.airspeed);
                break;
            case "altimeter":
                this.setAltitude(s.altitude);
                this.setPressure(s.pressure);
                break;
            default:
                this.setRoll(s.roll);
                this.setPitch(s.pitch);
                break;
        }
    }

    _q(selector) {
        return this._el?.querySelector(selector);
    }

    setRoll(roll) {
        const el = this._q("div.instrument.attitude div.roll");
        if (el) {
            el.style.transform = `rotate(${-roll}deg)`;
        }
    }

    setPitch(pitch) {
        if (pitch > CONSTANTS.pitch_bound) {
            pitch = CONSTANTS.pitch_bound;
        } else if (pitch < -CONSTANTS.pitch_bound) {
            pitch = -CONSTANTS.pitch_bound;
        }
        const el = this._q("div.instrument.attitude div.roll div.pitch");
        if (el) {
            el.style.top = `${-pitch * 0.7}%`;
        }
    }

    setHeading(heading) {
        const el = this._q("div.instrument.heading div.heading");
        if (el) {
            el.style.transform = `rotate(${-heading}deg)`;
        }
    }

    setTurn(turn) {
        const el = this._q("div.instrument.turn_coordinator div.turn");
        if (el) {
            el.style.transform = `rotate(${turn}deg)`;
        }
    }

    setVario(vario) {
        if (vario > CONSTANTS.vario_bound) {
            vario = CONSTANTS.vario_bound;
        } else if (vario < -CONSTANTS.vario_bound) {
            vario = -CONSTANTS.vario_bound;
        }
        vario = vario * 90;
        const el = this._q("div.instrument.vario div.vario");
        if (el) {
            el.style.transform = `rotate(${vario}deg)`;
        }
    }

    setAirSpeed(speed) {
        if (speed > CONSTANTS.airspeed_bound_h) {
            speed = CONSTANTS.airspeed_bound_h;
        } else if (speed < CONSTANTS.airspeed_bound_l) {
            speed = CONSTANTS.airspeed_bound_l;
        }
        speed = 90 + speed * 2;
        const el = this._q("div.instrument.airspeed div.speed");
        if (el) {
            el.style.transform = `rotate(${speed}deg)`;
        }
    }

    setAltitude(altitude) {
        const needle = 90 + ((altitude % 1000) * 360) / 1000;
        const needleSmall = (altitude / 10000) * 360;
        const el1 = this._q("div.instrument.altimeter div.needle");
        if (el1) {
            el1.style.transform = `rotate(${needle}deg)`;
        }
        const el2 = this._q("div.instrument.altimeter div.needleSmall");
        if (el2) {
            el2.style.transform = `rotate(${needleSmall}deg)`;
        }
    }

    setPressure(pressure) {
        pressure = 2 * pressure - 1980;
        const el = this._q("div.instrument.altimeter div.pressure");
        if (el) {
            el.style.transform = `rotate(${pressure}deg)`;
        }
    }

    resize(size) {
        const el = this._q("div.instrument");
        if (el) {
            el.style.height = `${size}px`;
            el.style.width = `${size}px`;
        }
    }

    showBox() {
        const el = this._q("img.box.background");
        if (el) {
            el.style.display = "";
        }
    }

    hideBox() {
        const el = this._q("img.box.background");
        if (el) {
            el.style.display = "none";
        }
    }
}

export function flightIndicator(selector, type, options) {
    return new FlightIndicator(selector, type, options);
}
