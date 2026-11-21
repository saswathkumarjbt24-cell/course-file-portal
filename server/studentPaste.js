// ---------------------------------------------------------------
// BEGIN REMOVABLE -- Student Directory (paste parser, server twin)
//
// CommonJS copy of client/src/data/studentPaste.js. Generated from it by
// stripping `export`; the function bodies are identical. THIS copy is the
// one that decides what is written -- routes/admin.js re-parses the raw
// pasted text with it on preview and again on apply, and never trusts rows
// parsed by the browser. Change both files together.
//
// No header row. Columns by position: 1 register number, 2 name, 3 batch,
// 4 programme, 5 department, 6 year, 7 email. 5-7 are discarded.
// ---------------------------------------------------------------

"use strict";

const DEFAULT_FILTER = 'BT'

// Column widths from migrations 003 and 027. Over-long values are SKIPPED
// with a reason rather than truncated.
const LIMITS = { regNumber: 20, name: 120, batch: 20, programme: 120 }

/** Split one line into cells on `sep`, honouring double quotes. */
function splitLine(line, sep) {
  const cells = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
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
      continue
    }
    if (ch === sep) {
      cells.push(field)
      field = ''
      continue
    }
    field += ch
  }
  cells.push(field)
  return cells
}

/** Trim, and collapse every run of whitespace inside to one space. */
function squash(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * Programme in one spelling: dots become spaces, an initial glued to a word
 * is split off ("BTech" -> "B Tech"), whitespace collapsed, then Title Case
 * word by word. So "BTech", "B Tech", "B tech" and "B.Tech" are all "B Tech".
 * An empty result is null.
 */
function normaliseProgramme(raw) {
  const spaced = String(raw ?? '')
    .replace(/\./g, ' ')
    .replace(/([A-Z])(?=[A-Z][a-z])/g, '$1 ')
  const words = squash(spaced).split(' ').filter((w) => w !== '')
  if (words.length === 0) return null
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

/**
 * Parse pasted text into rows.
 *
 * Returns { separator, filter, rows, skipped, programmes }:
 *   rows       [{ line, regNumber, name, batch, programme }] -- accepted
 *   skipped    [{ line, regNumber, reason }]
 *   programmes [{ value, count, spellings: [...] }] -- distinct normalised
 *              programme values across accepted rows, with the raw
 *              spellings that became each one
 *
 * `line` is the 1-based line number in the pasted text. Blank lines are
 * ignored and not reported. batch and programme are null when the cell is
 * empty: an empty cell means "not given", never "clear it".
 */
function parseStudentPaste(text, filterInput) {
  const filterText = squash(filterInput)
  const filter = filterText === '' ? DEFAULT_FILTER : filterText
  const needle = filter.toLowerCase()

  const src = String(text ?? '').replace(/^﻿/, '')
  const separator = src.includes('\t') ? 'tab' : 'comma'
  const sep = separator === 'tab' ? '\t' : ','
  const lines = src.split(/\r\n|\r|\n/)

  const candidates = []
  const skipped = []

  lines.forEach((raw, index) => {
    const line = index + 1
    if (raw.trim() === '') return
    const cells = splitLine(raw, sep)
    const regNumber = squash(cells[0])
    const name = squash(cells[1])
    const batch = squash(cells[2])
    const programmeRaw = squash(cells[3])

    if (regNumber === '') {
      skipped.push({ line, regNumber, reason: 'empty register number' })
      return
    }
    if (!regNumber.toLowerCase().includes(needle)) {
      skipped.push({ line, regNumber, reason: `register number does not contain "${filter}"` })
      return
    }
    if (name === '') {
      skipped.push({ line, regNumber, reason: 'empty name' })
      return
    }
    const programme = normaliseProgramme(programmeRaw)
    const tooLong = [
      ['register number', regNumber, LIMITS.regNumber],
      ['name', name, LIMITS.name],
      ['batch', batch, LIMITS.batch],
      ['programme', programme ?? '', LIMITS.programme],
    ].find(([, value, max]) => value.length > max)
    if (tooLong) {
      skipped.push({ line, regNumber, reason: `${tooLong[0]} is longer than ${tooLong[2]} characters` })
      return
    }

    candidates.push({
      line,
      regNumber,
      name,
      batch: batch === '' ? null : batch,
      programme,
      programmeRaw,
    })
  })

  // The same register number twice in one paste. Identical repeats keep the
  // first; repeats that DISAGREE are all skipped, because there is no way to
  // tell which one is right.
  const byReg = new Map()
  for (const row of candidates) {
    const key = row.regNumber.toLowerCase()
    if (!byReg.has(key)) byReg.set(key, [])
    byReg.get(key).push(row)
  }
  const rows = []
  for (const row of candidates) {
    const group = byReg.get(row.regNumber.toLowerCase())
    if (group.length === 1) {
      rows.push(row)
      continue
    }
    const first = group[0]
    const allSame = group.every(
      (r) => r.regNumber === first.regNumber && r.name === first.name &&
        r.batch === first.batch && r.programme === first.programme,
    )
    const lineList = group.map((r) => r.line).join(', ')
    if (!allSame) {
      skipped.push({
        line: row.line,
        regNumber: row.regNumber,
        reason: `register number appears on lines ${lineList} with different details`,
      })
    } else if (row === first) {
      rows.push(row)
    } else {
      skipped.push({ line: row.line, regNumber: row.regNumber, reason: `repeats line ${first.line}` })
    }
  }
  skipped.sort((a, b) => a.line - b.line)

  const programmeMap = new Map()
  for (const row of rows) {
    if (row.programme === null) continue
    if (!programmeMap.has(row.programme)) {
      programmeMap.set(row.programme, { value: row.programme, count: 0, spellings: [] })
    }
    const entry = programmeMap.get(row.programme)
    entry.count += 1
    if (!entry.spellings.includes(row.programmeRaw)) entry.spellings.push(row.programmeRaw)
  }

  return {
    separator,
    filter,
    rows: rows.map(({ line, regNumber, name, batch, programme }) => ({
      line, regNumber, name, batch, programme,
    })),
    skipped,
    programmes: [...programmeMap.values()].sort((a, b) => a.value.localeCompare(b.value)),
  }
}

module.exports = { DEFAULT_FILTER, LIMITS, normaliseProgramme, parseStudentPaste };

// END REMOVABLE -- Student Directory (paste parser, server twin)
