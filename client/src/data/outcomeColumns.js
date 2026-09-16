// BEGIN REMOVABLE -- PSO columns survive a missing PSO statement

/**
 * The column set of the CO - PO/PSO articulation matrix.
 *
 * THE FAULT THIS FIXES
 *   Every screen built its PSO columns straight from the
 *   program_specific_outcomes catalogue:
 *
 *     [...programOutcomes, ...programSpecificOutcomes]
 *
 *   so a PSO with no statement row had no column, and any correlation
 *   already stored against it in co_po_matrix became invisible -- while
 *   still driving the PSO attainment on the printed sheet. The catalogue
 *   describes what a PSO MEANS; co_po_matrix records what a course is
 *   MAPPED TO. The second does not depend on the first, and the columns
 *   must follow the mapping, not the prose.
 *
 *   That is not hypothetical. program_specific_outcomes was empty on this
 *   database until migration 025 filled it, and for exactly that reason
 *   this matrix showed PO1..PO12 and nothing else, on all three screens,
 *   while 22BT009 held eight stored PSO correlations the whole time.
 *
 * SO THE PSO COLUMNS ARE A UNION of
 *   1. the PSO catalogue, department-preferred (see below), and
 *   2. every PSO code this course actually has a row for,
 *   ordered by the number inside the code, so PSO10 sorts after PSO9 and
 *   not between PSO1 and PSO2.
 *
 *   A code in (2) but not (1) still gets a column. Its header carries a
 *   title saying the statement has not been entered, rather than an empty
 *   tooltip, because a blank hover looks like a bug.
 *
 * DEPARTMENT PREFERENCE
 *   PSOs are department-specific -- program_specific_outcomes.department is
 *   NOT NULL and the unique key is (department, code). GET
 *   /api/reference/outcomes returns every department's, so a course is
 *   shown the ones matching its own department. If none match, the whole
 *   catalogue is used rather than none: that is the fallback Outcomes.jsx
 *   already makes, and it is the safe direction -- showing a column too
 *   many is a cosmetic fault, showing one too few hides stored data, which
 *   is the fault being fixed here.
 *
 * WHAT THIS DOES NOT DO
 *   It does not touch the PO columns, which come from program_outcomes in
 *   their stored order, and it computes nothing. No attainment figure
 *   reads this file: poLevelFromCO and overallOutcomeLevel are given one
 *   column's values at a time and are indifferent to how many columns
 *   exist.
 */

// PO headers hover their short title ("Engineering knowledge"). A PSO has
// no short title in the schema -- only `statement` -- so that is what its
// header hovers, which is the same promise: hover to read what it means.
function psoTitle(entry) {
  if (entry && entry.statement) return entry.statement
  return 'Statement not entered yet'
}

// The digits inside PSO7 / PSO10, so ordering is numeric and not "PSO10"
// before "PSO2". A code with no digits sorts last, alphabetically.
function codeNumber(code) {
  const match = /(\d+)/.exec(code ?? '')
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

export function buildOutcomeColumns({
  programOutcomes = [],
  programSpecificOutcomes = [],
  matrixRows = [],
  department = null,
}) {
  const poColumns = programOutcomes.map((o) => ({
    code: o.code,
    type: 'PO',
    title: o.title,
  }))

  // 1. the catalogue, department-preferred with a whole-catalogue fallback
  const forDepartment = department
    ? programSpecificOutcomes.filter((o) => o.department === department)
    : []
  const catalogue = forDepartment.length > 0 ? forDepartment : programSpecificOutcomes

  const byCode = new Map()
  for (const entry of catalogue) {
    if (!entry || !entry.code) continue
    byCode.set(entry.code, { code: entry.code, type: 'PSO', title: psoTitle(entry) })
  }

  // 2. every PSO code this course is actually mapped to
  for (const row of matrixRows) {
    if (!row || row.outcomeType !== 'PSO') continue
    const code = row.outcomeCode
    if (!code || byCode.has(code)) continue
    byCode.set(code, { code, type: 'PSO', title: psoTitle(null) })
  }

  const psoColumns = [...byCode.values()].sort((a, b) => {
    const diff = codeNumber(a.code) - codeNumber(b.code)
    return diff !== 0 ? diff : a.code.localeCompare(b.code)
  })

  return [...poColumns, ...psoColumns]
}

// END REMOVABLE -- PSO columns survive a missing PSO statement
