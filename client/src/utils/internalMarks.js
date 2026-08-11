// ---------------------------------------------------------------
// Internal-mark risk rules - pure functions, no React, no data imports.
//
// Thresholds are per course nature and come from
// courseNatures[].lowImThreshold (Theory 23, Theory & Lab 27.5,
// Mini Project I 32). They are passed in, never hardcoded here.
// ---------------------------------------------------------------

/**
 * Rule: a student's internal mark is LOW when the total is BELOW the course
 * nature's lowImThreshold. Sitting exactly on the threshold is not low.
 * Returns false when there is no total to judge.
 */
export function isLowInternalMark(total, threshold) {
  if (total === null || total === undefined) return false
  if (threshold === null || threshold === undefined) return false
  return total < threshold
}

/**
 * Rule: how many marks short of the threshold the student is - the number
 * used by the "marks required to reach the minimum" list. Returns 0 for a
 * student already at or above the threshold, and null when it cannot be
 * worked out.
 */
export function marksBelowThreshold(total, threshold) {
  if (total === null || total === undefined) return null
  if (threshold === null || threshold === undefined) return null
  const short = threshold - total
  return short > 0 ? short : 0
}

/**
 * Rule: which distribution band a total falls in - the highest band whose
 * min is at or below the total. Bands are supplied by the caller, ordered
 * or not, in the same shape as attainmentBands: { label, min }.
 * Returns null when no band matches.
 */
export function bandFor(total, bands) {
  if (total === null || total === undefined) return null
  const ordered = [...bands].sort((a, b) => b.min - a.min)
  return ordered.find((band) => total >= band.min) ?? null
}
