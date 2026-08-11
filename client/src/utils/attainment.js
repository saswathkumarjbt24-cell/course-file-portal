// ---------------------------------------------------------------
// CO attainment rules - pure functions, no React, no data imports.
//
// The attainment bands are passed in (from mockData.attainmentBands)
// rather than imported, so these stay testable and the thresholds
// live in exactly one place.
//
// ABSENT STUDENTS ARE EXCLUDED. Every count below is over ATTENDED
// students only - an absent student is in neither the numerator nor
// the denominator. Callers must filter before calling.
// ---------------------------------------------------------------

/**
 * Rule: CO percentage for one student.
 * Marks obtained for a CO as a percentage of the marks allocated to it.
 * Returns null when nothing is allocated (0 or missing) - there is no
 * meaningful percentage, and it must not be treated as 0%.
 */
export function coPercent(obtained, allocated) {
  if (!allocated) return null
  if (obtained === null || obtained === undefined) return null
  return (obtained * 100) / allocated
}

/**
 * Rule: has this student achieved the CO?
 * The course target is inclusive - scoring exactly the target counts.
 */
export function isAchieved(percent, targetPercent) {
  if (percent === null || percent === undefined) return false
  return percent >= targetPercent
}

/**
 * Rule: percentage of students achieving the CO.
 * Denominator is ATTENDED students only. Returns null when nobody
 * attended, so the caller can show "no data" instead of 0%.
 */
export function percentAchieved(achievedCount, attendedCount) {
  if (!attendedCount) return null
  return (achievedCount * 100) / attendedCount
}

/**
 * Rule: CO attainment level from the percentage of students achieving it.
 * Takes the highest band whose minPercent is <= the percentage
 * (70 -> 3, 60 -> 2, 50 -> 1, 0 -> 0). Returns null when there is no
 * percentage, or when no band matches.
 */
export function attainmentLevel(percent, bands) {
  if (percent === null || percent === undefined) return null
  const ordered = [...bands].sort((a, b) => b.minPercent - a.minPercent)
  const band = ordered.find((b) => percent >= b.minPercent)
  return band ? band.level : null
}

/**
 * Rule: does this student need remedial work for the CO?
 * The complement of isAchieved - anything below the target.
 */
export function needsRemedial(percent, targetPercent) {
  if (percent === null || percent === undefined) return true
  return percent < targetPercent
}
