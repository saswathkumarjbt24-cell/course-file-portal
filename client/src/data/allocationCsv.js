// ---------------------------------------------------------------
// BEGIN REMOVABLE -- allocation CSV import (parser)
//
// Reading the department's allocation sheet, saved out of Google Sheets as
// CSV. Delete this file, the two functions in api.js and the panel in
// Allocations.jsx to remove the feature.
//
// WHY THIS IS HAND-WRITTEN AND NOT A DEPENDENCY
//   The job is one well-specified file shape from one source. A CSV library
//   is a supply-chain surface, a bundle cost and a version to keep up with,
//   for a state machine that fits on a screen. What it must survive is listed
//   below, and each line of it is tested.
//
// WHAT A REAL EXPORTED SHEET ACTUALLY CONTAINS
//   - a UTF-8 BOM on the first header cell, which Excel adds and which turns
//     "Course Code" into "﻿Course Code" and breaks a naive header match
//   - CRLF line endings, or CR alone from an older export
//   - fields wrapped in quotes because the value contains a comma, and "" for
//     a literal quote inside one of those
//   - a trailing blank line, often several
//   - spaces around values, left by hand-editing
//   - headers in whatever case and spacing the person typed
//
// NOTHING HERE DECIDES ANYTHING. It turns text into rows of strings. Every
// match, every rule and every refusal happens on the server, which re-runs
// all of it at apply time against the database as it is then.
// ---------------------------------------------------------------

/**
 * Split CSV text into rows of raw cell strings.
 *
 * A character-by-character state machine rather than a split on commas,
 * because a split cannot know whether a comma is inside quotes. Quotes open a
 * field only at its start (leading spaces allowed), so a stray quote in the
 * middle of an unquoted value is kept as text instead of swallowing the rest
 * of the file.
 *
 * Newlines inside a quoted field are part of the value, which is what makes a
 * course title containing a line break survive.
 */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }

  while (i < src.length) {
    const ch = src[i]

    if (inQuotes) {
      if (ch === '"') {
        // "" inside a quoted field is one literal quote.
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"' && field.trim() === '') {
      inQuotes = true
      field = ''
      i += 1
      continue
    }
    if (ch === ',') {
      endField()
      i += 1
      continue
    }
    if (ch === '\r') {
      // CRLF and a lone CR both end the row.
      if (src[i + 1] === '\n') i += 1
      endRow()
      i += 1
      continue
    }
    if (ch === '\n') {
      endRow()
      i += 1
      continue
    }

    field += ch
    i += 1
  }

  endRow()
  return rows
}

/** True when every cell of a row is blank -- a trailing or stray empty line. */
function blankRow(cells) {
  return cells.every((c) => String(c).trim() === '')
}

/** Header cells are matched case-insensitively, trimmed, inner runs collapsed. */
function headerKey(cell) {
  return String(cell).replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// The six columns of the format, by their header text.
//
// REQUIRED is only what cannot be defaulted or derived. Course Title is shown
// in the preview and never matched on; Semester is informational because a
// course already knows its own; and the department's current sheet has no
// email column at all, which is exactly why Name is a supported match key.
const COLUMNS = [
  { key: 'courseCode', header: 'Course Code', required: true },
  { key: 'courseTitle', header: 'Course Title', required: false },
  { key: 'semester', header: 'Semester', required: false },
  { key: 'facultyName', header: 'Allocated Faculty Name', required: true },
  { key: 'facultyEmail', header: 'Allocated Faculty Email', required: false },
  { key: 'role', header: 'Role', required: true },
]

/**
 * Turn the text of an allocation CSV into the rows the preview endpoint takes.
 *
 * Throws an Error whose message is a sentence an admin can act on -- which
 * header is missing, or that there is nothing in the file. A thrown message
 * here is a file problem, not a server one, and the screen shows it as such.
 *
 * Returns { rows, headers, missingOptional } where rows are plain objects of
 * trimmed strings, one per data line.
 */
export function readAllocationCsv(text) {
  const all = parseCsv(text).filter((cells) => !blankRow(cells))

  if (all.length === 0) {
    throw new Error('That file is empty. Export the allocation sheet as CSV and try again.')
  }

  const headerCells = all[0].map(headerKey)
  const indexOf = {}
  for (const column of COLUMNS) {
    const at = headerCells.indexOf(headerKey(column.header))
    indexOf[column.key] = at === -1 ? null : at
  }

  const missingRequired = COLUMNS.filter((c) => c.required && indexOf[c.key] === null)
  if (missingRequired.length > 0) {
    const names = missingRequired.map((c) => `"${c.header}"`).join(' and ')
    const found = all[0].map((c) => `"${String(c).replace(/^﻿/, '').trim()}"`).join(', ')
    throw new Error(
      `That file has no ${names} column. ` +
        `Its header row reads ${found}. ` +
        `The sheet needs a header row with Course Code, Allocated Faculty Name and Role.`
    )
  }

  const dataRows = all.slice(1)
  if (dataRows.length === 0) {
    throw new Error('That file has a header row but no allocations under it.')
  }

  const cell = (cells, key) => {
    const at = indexOf[key]
    if (at === null || at >= cells.length) return ''
    return String(cells[at]).trim()
  }

  const rows = dataRows.map((cells) => ({
    courseCode: cell(cells, 'courseCode'),
    courseTitle: cell(cells, 'courseTitle'),
    semester: cell(cells, 'semester'),
    facultyName: cell(cells, 'facultyName'),
    facultyEmail: cell(cells, 'facultyEmail'),
    role: cell(cells, 'role'),
  }))

  return {
    rows,
    headers: all[0].map((c) => String(c).replace(/^﻿/, '').trim()),
    // Named so the screen can say "this sheet has no email column, so names
    // were matched" rather than leaving the admin to infer it.
    missingOptional: COLUMNS.filter((c) => !c.required && indexOf[c.key] === null).map(
      (c) => c.header
    ),
  }
}

// END REMOVABLE -- allocation CSV import (parser)
