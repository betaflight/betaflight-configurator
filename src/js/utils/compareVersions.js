// Simple version comparison function
// Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
function compareVersions(v1, v2) {
    const a = v1.split(".").map(Number);
    const b = v2.split(".").map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const n1 = a[i] || 0;
        const n2 = b[i] || 0;
        if (n1 > n2) {
            return 1;
        }
        if (n1 < n2) {
            return -1;
        }
    }
    return 0;
}

// Add gte, lte, gt, lt, eq

compareVersions.gte = function (v1, v2) {
    return compareVersions(v1, v2) >= 0;
};

compareVersions.lte = function (v1, v2) {
    return compareVersions(v1, v2) <= 0;
};

compareVersions.gt = function (v1, v2) {
    return compareVersions(v1, v2) > 0;
};

compareVersions.lt = function (v1, v2) {
    return compareVersions(v1, v2) < 0;
};

compareVersions.eq = function (v1, v2) {
    return compareVersions(v1, v2) === 0;
};

// Returns the minor version number as integer
compareVersions.minor = function (v) {
    const parts = v.split(".").map(Number);
    return parts.length > 1 ? parts[1] : 0;
};

// Compares build/release strings, handling suffixes like '-dev', '-rc', etc.
compareVersions.compareBuild = function (a, b) {
    // Remove any suffixes for numeric comparison
    const stripSuffix = (v) => v.split("-")[0];
    const mainA = stripSuffix(a);
    const mainB = stripSuffix(b);
    const cmp = compareVersions(mainA, mainB);
    if (cmp !== 0) {
        return cmp;
    }
    // If main versions are equal, compare suffixes
    let suffixA = a.slice(mainA.length);
    let suffixB = b.slice(mainB.length);
    if (!suffixA && !suffixB) {
        return 0;
    }
    if (!suffixA) {
        return 1;
    } // e.g. 4.5.3 > 4.5.3-dev
    if (!suffixB) {
        return -1;
    }
    // Remove leading hyphens
    suffixA = suffixA.replace(/^-/, "");
    suffixB = suffixB.replace(/^-/, "");
    // Split into identifiers (dot or non-alphanumeric boundaries)
    const splitIdentifiers = (s) => (s.length === 0 ? [] : s.split(/\.|(?<=\D)(?=\d)|(?<=\d)(?=\D)/));
    const idsA = splitIdentifiers(suffixA);
    const idsB = splitIdentifiers(suffixB);
    const len = Math.max(idsA.length, idsB.length);
    for (let i = 0; i < len; i++) {
        const idA = idsA[i];
        const idB = idsB[i];
        if (idA === undefined) {
            return -1;
        }
        if (idB === undefined) {
            return 1;
        }
        const isNumA = /^\d+$/.test(idA);
        const isNumB = /^\d+$/.test(idB);
        if (isNumA && isNumB) {
            const numA = parseInt(idA, 10);
            const numB = parseInt(idB, 10);
            if (numA > numB) {
                return 1;
            }
            if (numA < numB) {
                return -1;
            }
        } else if (isNumA) {
            return -1;
        } else if (isNumB) {
            return 1;
        } else {
            if (idA > idB) {
                return 1;
            }
            if (idA < idB) {
                return -1;
            }
        }
    }
    // If all identifiers are equal, shorter list wins
    if (idsA.length > idsB.length) {
        return 1;
    }
    if (idsA.length < idsB.length) {
        return -1;
    }
    return 0;
};

export default compareVersions;
