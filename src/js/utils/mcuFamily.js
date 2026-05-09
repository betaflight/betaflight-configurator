// MCU family decoder. Maps the MCU name string from MSP2_MCU_INFO
// (firmware sends a readable string on API 1.47+, e.g. "STM32F411",
// "STM32H743", "AT32F435") to a short family tag the wing-fork
// analyzers/optimizers use to gate per-family behavior:
//
//   F4 — STM32F4xx burst-DMA constraint (two channels on same DMA
//        stream can't both DShot)
//   F7 — stream+request DMA (less restrictive than F4)
//   H7 — DMAMUX (most flexible; nearly any peripheral → any stream)
//   G4 — DMAMUX, stream-limited
//   AT32 — Artery clones; treated as F4-like for DMA reasoning
//        (conservative)
//   null — unknown family; callers MUST fall back to "treat AF as
//          immutable" / skip DMA-conflict reasoning
//
// Pure: input string → tag string (or null). No FC singleton access,
// no I/O. Caller passes `FC.MCU_INFO?.name`.

const FAMILY_PATTERNS = [
    { re: /^STM32F4/i, family: "F4" },
    { re: /^STM32F7/i, family: "F7" },
    { re: /^STM32H7/i, family: "H7" },
    { re: /^STM32G4/i, family: "G4" },
    { re: /^AT32F4/i, family: "AT32" },
];

export function mcuFamilyFromName(name) {
    if (typeof name !== "string" || name.length === 0) return null;
    for (const p of FAMILY_PATTERNS) {
        if (p.re.test(name)) return p.family;
    }
    return null;
}
