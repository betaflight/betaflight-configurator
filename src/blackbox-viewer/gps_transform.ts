/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

export interface CartesianPoint {
    x: number;
    y: number;
    z: number;
}

const Semimajor = 6378137,
    Flat = 1 / 298.257223563,
    Ecc_2 = Flat * (2 - Flat);

function deg2rad(deg: number): number {
    return (deg * Math.PI) / 180;
}

/**
 * Converts WGS84 coordinates to a local frame centred on (Lat0, Lon0, H0) and rotated by
 * Heading: `x` points along the heading, `y` up and `z` to its right.
 */
export class GPS_transform {
    readonly a11: number;
    readonly a12: number;
    readonly a13: number;
    readonly a21: number;
    readonly a22: number;
    readonly a23: number;
    readonly a31: number;
    readonly a32: number;
    readonly a33: number;
    readonly X0: number;
    readonly Y0: number;
    readonly Z0: number;
    readonly c11: number;
    readonly c12: number;
    readonly c21: number;
    readonly c22: number;

    constructor(Lat0: number, Lon0: number, H0: number, Heading: number) {
        Lat0 = deg2rad(Lat0);
        Lon0 = deg2rad(Lon0);
        const SinB = Math.sin(Lat0),
            CosB = Math.cos(Lat0),
            SinL = Math.sin(Lon0),
            CosL = Math.cos(Lon0),
            N = Semimajor / Math.sqrt(1 - Ecc_2 * SinB * SinB);

        this.a11 = -SinB * CosL;
        this.a12 = -SinB * SinL;
        this.a13 = CosB;
        this.a21 = -SinL;
        this.a22 = CosL;
        this.a23 = 0;
        this.a31 = CosL * CosB;
        this.a32 = CosB * SinL;
        this.a33 = SinB;
        this.X0 = (N + H0) * CosB * CosL;
        this.Y0 = (N + H0) * CosB * SinL;
        this.Z0 = (N + H0 - Ecc_2 * N) * SinB;
        this.c11 = Math.cos(deg2rad(Heading));
        this.c12 = Math.sin(deg2rad(Heading));
        this.c21 = -this.c12;
        this.c22 = this.c11;
    }

    WGS_ECEF(Lat: number, Lon: number, H: number): CartesianPoint {
        Lat = deg2rad(Lat);
        Lon = deg2rad(Lon);
        const SinB = Math.sin(Lat),
            CosB = Math.cos(Lat),
            SinL = Math.sin(Lon),
            CosL = Math.cos(Lon),
            N = Semimajor / Math.sqrt(1 - Ecc_2 * SinB * SinB);

        return {
            x: (N + H) * CosB * CosL,
            y: (N + H) * CosB * SinL,
            z: (N + H - Ecc_2 * N) * SinB,
        };
    }

    ECEF_BS(pos: CartesianPoint): CartesianPoint {
        const { X0, Y0, Z0 } = this;
        const PosX1 = this.a11 * (pos.x - X0) + this.a12 * (pos.y - Y0) + this.a13 * (pos.z - Z0);
        const PosZ1 = this.a21 * (pos.x - X0) + this.a22 * (pos.y - Y0) + this.a23 * (pos.z - Z0);

        return {
            x: this.c11 * PosX1 + this.c12 * PosZ1,
            y: this.a31 * (pos.x - X0) + this.a32 * (pos.y - Y0) + this.a33 * (pos.z - Z0),
            z: this.c21 * PosX1 + this.c22 * PosZ1,
        };
    }

    WGS_BS(Lat: number, Lon: number, H: number): CartesianPoint {
        return this.ECEF_BS(this.WGS_ECEF(Lat, Lon, H));
    }
}
