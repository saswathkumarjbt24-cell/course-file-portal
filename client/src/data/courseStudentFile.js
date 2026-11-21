// ---------------------------------------------------------------
// BEGIN REMOVABLE -- faculty roll management (file parser)
//
// Reading the course student template the department sent to faculty:
// a HEADER ROW, then one student per row, with two columns that matter:
//     Register Number | Name
// Any other column is ignored. The header row is REQUIRED -- this is NOT the
// admin directory format (studentPaste.js, seven positional columns, no
// header) and shares none of its rules.
//
// .csv and pasted text are read by hand here (no library, same style as
// allocationCsv.js). .xlsx is read with read-excel-file, loaded by a dynamic
// import() so it is fetched only when somebody actually uploads a workbook
// and never sits in the main bundle. First sheet only.
//
// NOTHING HERE DECIDES ANYTHING. It turns a file into { regNumber, name }
// rows. The server validates every row again and decides what happens.
//
// Delete this file, the faculty roll block in api.js and the panel in
// NameList.jsx (plus the server half in routes/courses.js) to remove it.
// ---------------------------------------------------------------

export const REG_MAX = 20
export const NAME_MAX = 120
export const MAX_ROWS = 1000

const WANTED = { regNumber: 'registernumber', name: 'name' }

/** "Register  Number" -> "registernumber". Case and every space ignored. */
function headerKey(cell) {
  return String(cell ?? '').replace(/^﻿/, '').replace(/\s+/g, '').toLowerCase()
}

function squash(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Split delimited text into rows of cells. Tab-separated when the text has a
 * tab anywhere (a copy from a spreadsheet), comma-separated otherwise. Double
 * quotes wrap a field, "" is a literal quote, and a newline inside quotes is
 * part of the value. CRLF, LF and lone CR all end a row.
 */
export function splitDelimited(text) {
  const src = String(text ?? '').replace(/^﻿/, '')
  const sep = src.includes('\t') ? '\t' : ','
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"' && field.trim() === '') {
      inQuotes = true
      field = ''
    } else if (ch === sep) {
      endField()
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i += 1
      endRow()
    } else if (ch === '\n') {
      endRow()
    } else {
      field += ch
    }
  }
  endRow()
  return rows
}

/**
 * Turn a grid (array of rows of cells, header first) into student rows.
 *
 * Returns { rows, skipped, error }:
 *   rows     [{ line, regNumber, name }]  line = row number in the file
 *   skipped  [{ line, regNumber, reason }]
 *   error    a sentence when the file cannot be read at all, else null
 *
 * The header is the first row that is not blank. Both "Register Number" and
 * "Name" must be in it; when they are not, the error quotes what that row
 * actually contained.
 */
export function rowsFromGrid(grid) {
  const blank = (cells) => cells.every((c) => squash(c) === '')
  const headerIndex = grid.findIndex((cells) => Array.isArray(cells) && !blank(cells))
  if (headerIndex === -1) {
    return { rows: [], skipped: [], error: 'The file is empty.' }
  }
  const header = grid[headerIndex]
  const keys = header.map(headerKey)
  const regCol = keys.indexOf(WANTED.regNumber)
  const nameCol = keys.indexOf(WANTED.name)
  if (regCol === -1 || nameCol === -1) {
    const missing = [regCol === -1 && '“Register Number”', nameCol === -1 && '“Name”']
      .filter(Boolean)
      .join(' and ')
    const found = header.map((c) => `“${squash(c)}”`).filter((c) => c !== '“”').join(', ')
    return {
      rows: [],
      skipped: [],
      error:
        `The first row must be the header row with “Register Number” and “Name”. ` +
        `${missing} ${missing.includes(' and ') ? 'were' : 'was'} not found. ` +
        `The first row of this file contains: ${found || '(nothing)'}.`,
    }
  }

  const rows = []
  const skipped = []
  for (let i = headerIndex + 1; i < grid.length; i += 1) {
    const cells = Array.isArray(grid[i]) ? grid[i] : []
    if (blank(cells)) continue
    const line = i + 1
    const regNumber = squash(cells[regCol])
    const name = squash(cells[nameCol])
    if (regNumber === '') skipped.push({ line, regNumber, reason: 'empty register number' })
    else if (name === '') skipped.push({ line, regNumber, reason: 'empty name' })
    else if (regNumber.length > REG_MAX) {
      skipped.push({ line, regNumber, reason: `register number is longer than ${REG_MAX} characters` })
    } else if (name.length > NAME_MAX) {
      skipped.push({ line, regNumber, reason: `name is longer than ${NAME_MAX} characters` })
    } else rows.push({ line, regNumber, name })
  }
  if (rows.length > MAX_ROWS) {
    return { rows: [], skipped, error: `The file has ${rows.length} students; at most ${MAX_ROWS} can be imported at once.` }
  }
  return { rows, skipped, error: null }
}

/** Pasted text or a .csv file's text. Header row required. */
export function parseCourseStudentText(text) {
  return rowsFromGrid(splitDelimited(text))
}

/**
 * Read an uploaded File (or Blob with a name). .csv and .xlsx only.
 * Resolves the same { rows, skipped, error } shape; never rejects for a bad
 * file -- the problem comes back as `error`.
 */
export async function readCourseStudentFile(file) {
  const name = String(file?.name ?? '').toLowerCase()
  try {
    if (name.endsWith('.csv')) {
      return parseCourseStudentText(await file.text())
    }
    if (name.endsWith('.xlsx')) {
      const { readSheet } = await import('read-excel-file/browser')
      const grid = await readSheet(file)
      return rowsFromGrid(grid)
    }
  } catch (err) {
    return { rows: [], skipped: [], error: `The file could not be read: ${err?.message ?? 'unknown error'}` }
  }
  return {
    rows: [],
    skipped: [],
    error: 'Only .csv and .xlsx files can be read. Save the sheet as one of those and try again.',
  }
}

// END REMOVABLE -- faculty roll management (file parser)
