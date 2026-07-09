/**
 * ESKF noise-parameter tuning by innovation log-likelihood.
 *
 * Replaces the earlier approach of grid-searching sigmas against an RMSE
 * computed versus an externally-derived, similarity-aligned reference
 * trajectory: that objective is dataset-specific (fit to one flight's
 * multipath and to whatever a free 7-DoF alignment happens to absorb) and rewards
 * *smoothness* as much as *truth* — exactly the failure mode this pipeline
 * needs to avoid for photogrammetry-grade output.
 *
 * The fitting objective is the classical innovation-based maximum-likelihood
 * identification of noise parameters (Mehra 1970; the batch/EM equivalent is
 * Shumway & Stoffer's state-space EM). For a linear-Gaussian filter, the
 * per-update innovation r_k ~ N(0, S_k(theta)), so the log marginal
 * likelihood decomposes as:
 *
 *   log L(theta) = -1/2 * sum_k ( log det S_k(theta) + r_k^T S_k(theta)^-1 r_k + d_k log(2*pi) )
 *
 * r_k, S_k are the innovation and innovation covariance already recorded per
 * update (S_k's Mahalanobis form r_k^T S_k^-1 r_k is exactly NIS_k). This
 * dominates plain NIS-moment matching: a parameter set can hit mean(NIS/df)=1
 * while being badly wrong (overconfident half the flight, underconfident the
 * other half -- the errors average out). Log-likelihood penalizes both tails
 * at every single update, so a filter that maximizes it is NIS-consistent
 * *and* has the sharpest covariance the data actually supports.
 *
 * mean(NIS/df) is retained as a human-readable diagnostic (~1.0 = consistent)
 * but tuning now fits by minimizing -2*logL (equivalently: sum of
 * logDetS_k + NIS_k + d_k*log(2*pi) across updates) instead.
 */
import { estimatePoseTrackWithDiagnostics } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';
import type { EstimatorData, EstimatorOrigin, EstimatorOpts } from '../../../src/blackbox-viewer/pose/estimatorLoop.js';

const LOG_2PI = Math.log(2 * Math.PI);

export interface NisSummary {
  sensor: string;
  n: number;
  meanNisPerDf: number; // ~1.0 is consistent (human-readable diagnostic only)
  logDeviation: number; // ln(meanNisPerDf), 0 is ideal (diagnostic only)
  /** Sum over this sensor's updates of (logDetS_k + NIS_k + d_k*log(2*pi)) ==
   *  -2 * this sensor's contribution to the innovation log-likelihood.
   *  Lower is better; this is what tuning actually minimizes. */
  negTwoLogLik: number;
}

export interface TuneCandidate {
  gpsPosSigma: number;
  gpsVelSigma: number;
  baroSigma: number;
}

export interface TuneResult {
  candidate: TuneCandidate;
  /** Sum of negTwoLogLik across the requested sensors. Lower is better. */
  objective: number;
  perSensor: NisSummary[];
}

export function summarizeNis(
  nisHistory: Record<string, { tUs: number; nis: number; df: number; logDetS: number }[]> | undefined,
): NisSummary[] {
  if (!nisHistory) return [];
  const out: NisSummary[] = [];
  for (const [sensor, entries] of Object.entries(nisHistory)) {
    if (!entries || entries.length === 0) continue;
    const meanNisPerDf = entries.reduce((a, e) => a + e.nis / e.df, 0) / entries.length;
    const negTwoLogLik = entries.reduce(
      (a, e) => a + e.logDetS + e.nis + e.df * LOG_2PI,
      0,
    );
    out.push({
      sensor,
      n: entries.length,
      meanNisPerDf,
      logDeviation: Math.log(Math.max(meanNisPerDf, 1e-9)),
      negTwoLogLik,
    });
  }
  return out;
}

/** Sum of -2*logL contributions across the requested sensors (lower = better fit). */
function objectiveFromSummary(summary: NisSummary[], sensors: string[]): number {
  let sum = 0;
  for (const sensor of sensors) {
    const s = summary.find((x) => x.sensor === sensor);
    if (!s) continue; // sensor absent from this log (e.g. no baro) — skip, don't penalize
    sum += s.negTwoLogLik;
  }
  return sum;
}

/** Maps each tunable sigma to the sensor name whose update count bounds its prior weight. */
const PARAM_SENSOR: Record<keyof TuneCandidate, string> = {
  gpsPosSigma: 'gpsPos',
  gpsVelSigma: 'gpsVel',
  baroSigma: 'baro',
};

/**
 * Log-normal prior on each sigma, anchored at `prior.candidate`, penalizing
 * log(candidate/prior)^2 per parameter -- scaled by that parameter's own
 * update count `n` (from `perSensor`), not a fixed constant. This is what
 * turns per-flight tuning into empirical-Bayes MAP estimation instead of
 * unconstrained MLE, and the n-scaling is load-bearing, not cosmetic: it
 * closes a real, empirically-confirmed degeneracy where an unconstrained
 * innovation log-likelihood can be driven arbitrarily low by shrinking a
 * sigma toward 0 (trusting a sensor completely makes the filter copy it,
 * driving its own apparent residual toward 0 too, so log det S -> -infinity
 * dominates the bounded NIS term). That per-update log-likelihood gain is
 * O(n) in the number of updates, so a FIXED-weight prior that stops a
 * collapse on a short synthetic flight (n~300) is invisible against a
 * multi-thousand-sample real flight -- the prior's pull must grow with n at
 * the same rate the evidence does. `weight` is then interpretable as "prior
 * strength per observation", not an absolute constant, and stays meaningful
 * across flights of any length.
 */
function priorPenalty(
  candidate: TuneCandidate,
  prior: TuneCandidate,
  weight: number,
  perSensor: NisSummary[],
): number {
  if (weight <= 0) return 0;
  const keys: (keyof TuneCandidate)[] = ['gpsPosSigma', 'gpsVelSigma', 'baroSigma'];
  let sum = 0;
  for (const k of keys) {
    const sensor = PARAM_SENSOR[k];
    const n = perSensor.find((s) => s.sensor === sensor)?.n ?? 0;
    if (n === 0) continue; // sensor absent from this log -- no evidence, no prior needed either
    const d = Math.log(candidate[k] / prior[k]);
    sum += n * d * d;
  }
  return weight * sum;
}

export function evaluateCandidate(
  data: EstimatorData,
  origin: EstimatorOrigin,
  candidate: TuneCandidate,
  baseOpts: EstimatorOpts = {},
  sensors: string[] = ['gpsPos', 'gpsVel', 'baro'],
  prior?: { candidate: TuneCandidate; weight: number },
): TuneResult {
  const result = estimatePoseTrackWithDiagnostics(data, origin, {
    ...baseOpts,
    gpsPosSigma: candidate.gpsPosSigma,
    gpsVelSigma: candidate.gpsVelSigma,
    baroSigma: candidate.baroSigma,
  });
  const perSensor = summarizeNis(result.nisHistory);
  const dataObjective = objectiveFromSummary(perSensor, sensors);
  const objective = prior
    ? dataObjective + priorPenalty(candidate, prior.candidate, prior.weight, perSensor)
    : dataObjective;
  return {
    candidate,
    objective,
    perSensor,
  };
}

/**
 * 1D coordinate-descent search: for each parameter in turn, try a
 * multiplicative grid of factors around the current value and keep the best,
 * then move to the next parameter. Repeats for a fixed number of sweeps.
 * Deliberately simple (no external optimizer dependency) — the objective is
 * cheap to evaluate (one filter pass) and roughly unimodal per axis (the
 * negative log-likelihood is convex in log-sigma near the optimum for a
 * Gaussian innovation model), so coordinate descent converges in a handful
 * of sweeps. Because sigma enters as a per-flight *empirical-Bayes* fit here
 * (the shipped constants are the prior; this loop is the offline posterior
 * refinement an offline tool is entitled to do), running this per-flight
 * before freezing shipped defaults resolves flight-to-flight sigma
 * disagreement in the statistically principled direction rather than by a
 * heuristic (e.g. "first N seconds") or by picking one flight arbitrarily.
 */
export function tuneByNisConsistency(
  data: EstimatorData,
  origin: EstimatorOrigin,
  initial: TuneCandidate,
  opts: {
    baseOpts?: EstimatorOpts;
    sensors?: string[];
    sweeps?: number;
    factors?: number[];
    /** Log-normal prior weight *per observation*, anchored at `initial`,
     *  mitigating the sigma-collapse degeneracy documented on `priorPenalty`
     *  above (the actual per-parameter penalty is
     *  `priorWeight * n * log(candidate/prior)^2`, n being that parameter's
     *  own update count). Set to 0 for unconstrained MLE (not recommended:
     *  empirically confirmed unbounded on synthetic data).
     *
     *  This is a genuine, unresolved tension, not a fully-solved dial: on a
     *  300-update synthetic flight starting 6x too tight, it took weight~50
     *  to fully arrest a collapse toward sigma=0 -- but weight=50 on a real
     *  2243-update flight (reference_flight1) was strong enough to block
     *  ALL movement, including gpsVelSigma's clearly-needed correction
     *  (NIS/df=14.957, badly overconfident, yet the search couldn't move it
     *  at all under that weight). The "pull" per observation toward the
     *  pathological collapse and the pull toward a legitimate correction are
     *  not the same size, so one fixed n-scaled constant cannot both fully
     *  block the former and fully permit the latter.
     *
     *  Default (2) is chosen to favor real, useful tuning corrections on
     *  real flights over defending against an adversarial synthetic
     *  scenario that starts many-fold mistuned -- shipped starting points in
     *  practice are the already-NIS-reasonable frozen defaults, not a 6x-off
     *  guess, so the collapse scenario this prior defends against is
     *  unlikely to be reached in practice. Treat any tuning run's *output*
     *  meanNisPerDf as the real safety check regardless: a result far from
     *  ~1.0 on the tuned flight itself (not just the held-out one) means
     *  something -- prior, search grid, or genuine data pathology -- needs
     *  attention before the candidate is trusted. */
    priorWeight?: number;
  } = {},
): { best: TuneResult; history: TuneResult[] } {
  const {
    baseOpts = {},
    sensors = ['gpsPos', 'gpsVel', 'baro'],
    sweeps = 3,
    factors = [0.5, 0.7, 0.85, 1.0, 1.15, 1.3, 1.5, 2.0],
    priorWeight = 2,
  } = opts;
  const prior = { candidate: { ...initial }, weight: priorWeight };

  let current: TuneCandidate = { ...initial };
  let best = evaluateCandidate(data, origin, current, baseOpts, sensors, prior);
  const history: TuneResult[] = [best];

  const keys: (keyof TuneCandidate)[] = ['gpsPosSigma', 'gpsVelSigma', 'baroSigma'];

  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (const key of keys) {
      let sweepBest = best;
      for (const f of factors) {
        const candidate: TuneCandidate = { ...current, [key]: current[key] * f };
        const result = evaluateCandidate(data, origin, candidate, baseOpts, sensors, prior);
        history.push(result);
        if (result.objective < sweepBest.objective) sweepBest = result;
      }
      if (sweepBest.objective < best.objective) {
        best = sweepBest;
        current = { ...sweepBest.candidate };
      }
    }
  }

  return { best, history };
}

/**
 * Leave-one-flight-out validation: tune noise parameters on `tuneFlight`,
 * then report NIS consistency of those SAME parameters on `validateFlight`.
 * A tuning that only fits `tuneFlight`'s specific multipath/geometry will
 * show degraded (non-unity) NIS ratios on the held-out flight; a physically
 * sound tuning should generalize reasonably well.
 */
export function leaveOneFlightOutValidation(
  tuneFlight: { data: EstimatorData; origin: EstimatorOrigin },
  validateFlight: { data: EstimatorData; origin: EstimatorOrigin },
  initial: TuneCandidate,
  opts: { baseOpts?: EstimatorOpts; sensors?: string[]; sweeps?: number; factors?: number[] } = {},
): {
  initial: TuneResult;
  tuned: TuneResult;
  validation: TuneResult;
} {
  const { best, history } = tuneByNisConsistency(tuneFlight.data, tuneFlight.origin, initial, opts);
  const validation = evaluateCandidate(
    validateFlight.data,
    validateFlight.origin,
    best.candidate,
    opts.baseOpts,
    opts.sensors,
  );
  return { initial: history[0], tuned: best, validation };
}

export interface SensorRegression {
  sensor: string;
  initialMeanNisPerDf: number;
  finalMeanNisPerDf: number;
}

/**
 * Guard against the joint-objective coupling found during development: the
 * coordinate descent minimizes a SUM of per-sensor negative log-likelihoods,
 * so it can legally accept a candidate where one sensor's OWN NIS consistency
 * gets worse as long as the other sensors improve enough to shrink the total
 * (per-sensor log-likelihood terms are separable, so this can still happen
 * under the ML objective exactly as it could under moment-matching). That's
 * mathematically correct for a summed objective, but not always what's
 * wanted if every sensor's own consistency matters on its own merits (e.g.
 * velocity NIS regressing from ~1x to ~9x overconfident while gpsPos/baro
 * improve) — this makes that failure mode explicit and checkable instead of
 * relying on eyeballing printed NIS numbers. Kept in terms of mean(NIS/df)
 * (the diagnostic), not the likelihood objective itself, since that's the
 * human-interpretable quantity the regression actually describes.
 */
export function findRegressedSensors(
  initial: TuneResult,
  final: TuneResult,
): SensorRegression[] {
  const regressed: SensorRegression[] = [];
  for (const finalSummary of final.perSensor) {
    const initialSummary = initial.perSensor.find((s) => s.sensor === finalSummary.sensor);
    if (!initialSummary) continue;
    if (Math.abs(finalSummary.logDeviation) > Math.abs(initialSummary.logDeviation)) {
      regressed.push({
        sensor: finalSummary.sensor,
        initialMeanNisPerDf: initialSummary.meanNisPerDf,
        finalMeanNisPerDf: finalSummary.meanNisPerDf,
      });
    }
  }
  return regressed;
}
