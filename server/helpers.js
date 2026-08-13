// ---------------------------------------------------------------
// Shared helpers for the API routes.
//
//   1. asyncHandler / HttpError / ValidationError - so a thrown or rejected
//      handler always becomes a JSON response instead of a crashed process
//   2. withTransaction - one pooled connection, committed or rolled back
//   3. num / bool - MySQL type coercion. mysql2 hands DECIMAL back as a
//      STRING and TINYINT(1) back as 0/1; the frontend must never do
//      arithmetic on a string or truthiness on a number.
//   4. request-body validation primitives
//   5. mapNature / mapCourse - snake_case row -> camelCase JSON
// ---------------------------------------------------------------

const pool = require("./db");

/**
 * Wrap an async route handler so a rejected promise is handed to Express's
 * error middleware rather than becoming an unhandled rejection (which, from
 * Node 15 on, terminates the process).
 */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * An error that carries an HTTP status. Handlers throw it; the error
 * middleware in index.js renders it as JSON.
 */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * A 400 that carries the list of offending rows. Thrown BEFORE any write, so
 * a body that fails validation saves nothing at all.
 */
class ValidationError extends HttpError {
  constructor(issues, message = "Validation failed; nothing was saved") {
    super(400, message);
    this.name = "ValidationError";
    this.issues = issues;
  }
}

/**
 * Run fn inside a transaction on ONE connection taken from the shared pool.
 * Commits on success, rolls back on any throw, and always releases.
 *
 * The connection is handed to fn: every query inside a transaction MUST use
 * it rather than the pool, or it lands on a different connection and outside
 * the transaction.
 */
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let result;
    try {
      result = await fn(conn);
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    await conn.commit();
    return result;
  } finally {
    conn.release();
  }
}

/**
 * DECIMAL columns arrive from mysql2 as strings ("60.00"). Convert to Number.
 * NULL stays null -- an absent mark is not the number 0.
 */
function num(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/**
 * TINYINT(1) arrives as 0 or 1. Convert to a real boolean.
 * NULL stays null, so "no mark row at all" stays distinguishable from
 * "present and not absent".
 */
function bool(value) {
  if (value === null || value === undefined) return null;
  return Boolean(value);
}

/** Route ids must be positive integers. Returns the number, or null. */
function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Read a positive-integer route param, or throw 400. */
function requireId(req, param = "id") {
  const id = parseId(req.params[param]);
  if (id === null) {
    throw new HttpError(400, `Invalid ${param}: must be a positive integer`);
  }
  return id;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Read an optional number from a request body.
 * Returns {ok, value} -- value null when the field is absent, null, or "".
 * A non-numeric string is a failure, not a silent 0.
 */
function optionalNumber(raw) {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  if (typeof raw === "boolean") return { ok: false };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

/**
 * Read an optional short string from a request body.
 *
 * Trims, and treats an empty or all-whitespace value as null rather than "".
 * A column that means "not recorded yet" must hold NULL: an empty string would
 * print as a blank line on a cover sheet and read as a recorded blank.
 *
 * Returns {ok, value} -- ok false when the value is not a string, or is longer
 * than the column can hold. Length is checked HERE rather than left to MySQL,
 * so an over-long value is a 400 naming the field instead of a 500 from a
 * truncation error.
 */
function optionalString(raw, maxLength) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false, value: null };
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.length > maxLength) return { ok: false, value: null };
  return { ok: true, value: trimmed };
}

/** A DATE the client sent must be exactly YYYY-MM-DD. */
function isDateString(raw) {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [y, m, d] = raw.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

/**
 * course_natures columns of a joined row -> the nature object.
 * Expects the join to alias name/notes as nature_name / nature_notes.
 */
function mapNature(row) {
  return {
    id: row.nature_id,
    name: row.nature_name,
    pt1Max: num(row.pt1_max),
    pt2Max: num(row.pt2_max),
    ipMax: num(row.ip_max),
    intTotal: num(row.int_total),
    seeTotal: num(row.see_total),
    lowImThreshold: num(row.low_im_threshold),
    notes: row.nature_notes,
  };
}

/** A courses row joined to course_natures -> the course object. */
function mapCourse(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    natureId: row.nature_id,
    regulationYear: row.regulation_year,
    department: row.department,
    coCount: row.co_count,
    coTargetPercent: num(row.co_target_percent),
    nature: mapNature(row),
  };
}

/** The SELECT list and FROM shared by every endpoint returning a course. */
const COURSE_SELECT = `
  c.id,
  c.code,
  c.title,
  c.nature_id,
  c.regulation_year,
  c.department,
  c.co_count,
  c.co_target_percent,
  n.name  AS nature_name,
  n.pt1_max,
  n.pt2_max,
  n.ip_max,
  n.int_total,
  n.see_total,
  n.low_im_threshold,
  n.notes AS nature_notes
`;

const COURSE_FROM = `
  FROM courses        AS c
  JOIN course_natures AS n ON n.id = c.nature_id
`;

// ---------------------------------------------------------------------
// The offering columns added by migration 012.
//
// DELIBERATELY SEPARATE FROM COURSE_SELECT. Adding them there would change
// what GET /api/courses and GET /api/faculty/:id/courses return, and those
// two responses are relied on as they stand. Only GET /api/courses/:id
// selects this block.
//
// Every one of them is NULLable and every one of them arrives as null for a
// course whose cover page has never been filled in. A screen must render a
// placeholder for null, never an empty string -- see optionalString above.
// ---------------------------------------------------------------------
const COURSE_META_SELECT = `
  c.programme,
  c.batch,
  c.academic_year,
  c.year_of_study,
  c.semester,
  c.section
`;

/** The migration-012 offering columns of a courses row -> camelCase JSON. */
function mapCourseMeta(row) {
  return {
    programme: row.programme,
    batch: row.batch,
    academicYear: row.academic_year,
    yearOfStudy: row.year_of_study,
    semester: row.semester,
    section: row.section,
  };
}

module.exports = {
  asyncHandler,
  HttpError,
  ValidationError,
  withTransaction,
  num,
  bool,
  parseId,
  requireId,
  isPlainObject,
  optionalNumber,
  optionalString,
  isDateString,
  mapNature,
  mapCourse,
  mapCourseMeta,
  COURSE_SELECT,
  COURSE_FROM,
  COURSE_META_SELECT,
};
