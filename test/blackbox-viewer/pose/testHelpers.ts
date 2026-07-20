/**
 * Shared test utilities.
 *
 * describeIntegration: a describe block that is skipped in CI (where
 * process.env.RUN_INTEGRATION is not set) so the fast `npm test` CI build
 * never runs expensive estimator-on-real-log tests. Developers run the full
 * suite locally with `npm run test:full`.
 */
import { describe as vitestDescribe } from 'vitest';

// ---------------------------------------------------------------------------
// Deterministic seeded PRNG (mulberry32) — use instead of Math.random() in
// tests so results are reproducible and SonarCloud hotspots are resolved.
// ---------------------------------------------------------------------------

/**
 * Create a mulberry32 PRNG seeded with the given 32-bit integer.
 * Returns a function with the same interface as Math.random() (uniform [0, 1)).
 *
 * Example:
 *   const rng = seededRng(42);
 *   const x = rng(); // deterministic
 */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUN_INTEGRATION =
  process.env.RUN_INTEGRATION === '1' || process.env.RUN_INTEGRATION === 'true';

/**
 * Wraps vitest's describe, skipping the block unless RUN_INTEGRATION=1.
 *
 * Usage:
 *   describeIntegration('my heavy test', () => { ... });
 */
export const describeIntegration = RUN_INTEGRATION
  ? vitestDescribe
  : vitestDescribe.skip;
