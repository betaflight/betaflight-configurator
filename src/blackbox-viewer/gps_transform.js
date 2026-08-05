export function GPS_transform(Lat0, Lon0, H0, Heading) {
    function deg2rad(deg) {
        return (deg * Math.PI) / 180;
    }

    Lat0 = deg2rad(Lat0);
    Lon0 = deg2rad(Lon0);
    const Semimajor = 6378137,
        Flat = 1 / 298.257223563,
        Ecc_2 = Flat * (2 - Flat),
        SinB = Math.sin(Lat0),
        CosB = Math.cos(Lat0),
        SinL = Math.sin(Lon0),
        CosL = Math.cos(Lon0),
        N = Semimajor / Math.sqrt(1 - Ecc_2 * SinB * SinB),
        a11 = -SinB * CosL,
        a12 = -SinB * SinL,
        a13 = CosB,
        a21 = -SinL,
        a22 = CosL,
        a23 = 0,
        a31 = CosL * CosB,
        a32 = CosB * SinL,
        a33 = SinB,
        X0 = (N + H0) * CosB * CosL,
        Y0 = (N + H0) * CosB * SinL,
        Z0 = (N + H0 - Ecc_2 * N) * SinB,
        c11 = Math.cos(deg2rad(Heading)),
        c12 = Math.sin(deg2rad(Heading)),
        c21 = -c12,
        c22 = c11;

    this.WGS_ECEF = function (Lat, Lon, H) {
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
    };

    this.ECEF_BS = function (pos) {
        const PosX1 = a11 * (pos.x - X0) + a12 * (pos.y - Y0) + a13 * (pos.z - Z0);
        const PosZ1 = a21 * (pos.x - X0) + a22 * (pos.y - Y0) + a23 * (pos.z - Z0);

        return {
            x: c11 * PosX1 + c12 * PosZ1,
            y: a31 * (pos.x - X0) + a32 * (pos.y - Y0) + a33 * (pos.z - Z0),
            z: c21 * PosX1 + c22 * PosZ1,
        };
    };

    this.WGS_BS = function (Lat, Lon, H) {
        return this.ECEF_BS(this.WGS_ECEF(Lat, Lon, H));
    };
}
