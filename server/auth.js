// ---------------------------------------------------------------
// AUTHENTICATION AND AUTHORISATION
//
// Two different jobs, kept apart:
//
//   requireAuth   WHO you are. Verifies the session token and loads your
//                 faculty row. 401 when it cannot.
//   requireRole   WHAT you are. 403 when your role is not in the list.
//   course scope  WHICH courses you may touch. 403, or a narrowed query.
//
// NOT TO BE CONFUSED WITH routes/auth.js, which is the sign-in ENDPOINT --
// it verifies a Google ID token once and mints the session token this file
// then verifies on every subsequent request.
//
//
// THE TOKEN IS NEVER LOGGED
//   Not on success, not on failure, not in an error message. jwt.verify's own
//   error can quote the token, so it is caught and DROPPED: nothing derived
//   from it is logged or returned. The 401 bodies below are fixed sentences.
//
//
// THE DATABASE IS THE AUTHORITY, NOT THE TOKEN
//   The token carries the faculty id, email and role, but only the id is
//   trusted -- and only as a lookup key. Every request re-reads the faculty
//   row, so deactivating an account or changing a role takes effect on the
//   very next request rather than in up to twelve hours' time. A token whose
//   `role` claim says 'admin' gets exactly the privileges its DATABASE ROW
//   says, which is the whole point of paying for that extra SELECT.
//
//
// THE CLIENT IS NEVER ASKED WHO IT IS
//   No handler reads a faculty id, department or role from a body, a query
//   string or a header other than the signed token. Everything below derives
//   from req.faculty, which only requireAuth writes.
// ---------------------------------------------------------------

const jwt = require("jsonwebtoken");
require("dotenv").config();
const pool = require("./db");
const { asyncHandler, HttpError, parseId } = require("./helpers");

const SECRET = process.env.JWT_SECRET || "";

// ---------------------------------------------------------------------
// A MISSING SECRET IS A STARTUP FAILURE, NOT A WARNING.
//
// The two alternatives are both worse than refusing to boot: a hardcoded
// fallback is a published key, and a per-process random one signs everybody
// out on every restart while looking like it works. Thrown at require time so
// it happens on `npm start` rather than on the first sign-in attempt.
// ---------------------------------------------------------------------
if (SECRET === "") {
  throw new Error(
    "JWT_SECRET is not set. Add it to server/.env -- see server/.env.example."
  );
}

// Twelve hours: long enough to cover a working day without a re-login
// mid-marking, short enough that a token copied off a shared lab machine
// stops working the same day. Deactivation does not wait for it -- see the
// fresh row read in requireAuth.
const TOKEN_TTL = "12h";

// Pinned in BOTH directions. Verifying without an explicit algorithm list is
// what makes "alg: none" and RS/HS confusion attacks possible; naming HS256
// here means a token signed any other way is simply invalid.
const ALGORITHM = "HS256";

/**
 * Mint a session token for a faculty row.
 *
 * `sub` is a string because that is what the JWT spec says it is. email and
 * role are informational -- they let a client show who is signed in without
 * another round trip, and are re-read from the database on every request
 * regardless of what they say here.
 */
function signToken(faculty) {
  return jwt.sign(
    {
      sub: String(faculty.id),
      email: faculty.email,
      role: faculty.role,
    },
    SECRET,
    { algorithm: ALGORITHM, expiresIn: TOKEN_TTL }
  );
}

/** The bearer token, or a 401 explaining which part was wrong. */
function bearerToken(req) {
  const header = req.get("authorization");
  if (!header) {
    throw new HttpError(
      401,
      "This endpoint needs a signed-in session. Send 'Authorization: Bearer <token>'."
    );
  }
  const match = /^Bearer[ \t]+(\S+)$/i.exec(header.trim());
  if (!match) {
    throw new HttpError(401, "The Authorization header must be 'Bearer <token>'.");
  }
  return match[1];
}

/**
 * The token's payload, or a 401.
 *
 * Expiry is reported separately from every other failure because it is the
 * one the user can fix by signing in again, and the frontend says so.
 */
function verifyToken(raw) {
  try {
    return jwt.verify(raw, SECRET, { algorithms: [ALGORITHM] });
  } catch (err) {
    // Deliberately dropped: the error can quote the token.
    if (err && err.name === "TokenExpiredError") {
      throw new HttpError(401, "Your session has expired. Please sign in again.");
    }
    throw new HttpError(401, "Your session is not valid. Please sign in again.");
  }
}

// ---------------------------------------------------------------------
// requireAuth
//
// 401 -- not 403 -- for every failure here, including a deactivated or
// deleted account. 401 means "sign in again", which is what the frontend does
// with it; 403 means "you are signed in and still may not", which would leave
// a dead session in place with no way out.
// ---------------------------------------------------------------------
const requireAuth = asyncHandler(async (req, res, next) => {
  const payload = verifyToken(bearerToken(req));

  const id = parseId(payload.sub);
  if (id === null) {
    throw new HttpError(401, "Your session is not valid. Please sign in again.");
  }

  // Read FRESH on every request. This is what makes a deactivation or a role
  // change immediate rather than eventual.
  const [rows] = await pool.execute(
    `SELECT id, name, email, department, designation, role, is_active
       FROM faculty
      WHERE id = ?`,
    [id]
  );
  if (rows.length === 0) {
    throw new HttpError(
      401,
      "That faculty account no longer exists. Please sign in again."
    );
  }

  const row = rows[0];
  if (!row.is_active) {
    throw new HttpError(401, "That faculty account is no longer active.");
  }

  req.faculty = {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    designation: row.designation,
    role: row.role,
  };

  next();
});

/**
 * 403 unless the signed-in role is one of `roles`.
 *
 * A missing req.faculty is a 500, not a 403: it means this middleware was
 * mounted somewhere requireAuth is not, which is a wiring bug and must be
 * loud rather than silently denying everyone.
 */
function requireRole(...roles) {
  return function (req, res, next) {
    if (!req.faculty) {
      next(new HttpError(500, "requireRole was reached without requireAuth"));
      return;
    }
    if (!roles.includes(req.faculty.role)) {
      next(
        new HttpError(
          403,
          `This needs the ${roles.join(" or ")} role. Your account is '${req.faculty.role}'.`
        )
      );
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------
// COURSE SCOPE
//
// One definition of "which courses is this person allowed to touch",
// expressed as a SQL predicate so it can be used two ways without the two
// ever drifting apart:
//
//   canAccessCourse()  one course -> true/false, for the 403 gates
//   courseScope()      a predicate spliced into a list query, for filtering
//
// A LIST FILTERS; A NAMED COURSE 403s. Returning a course from GET
// /api/courses that the caller cannot then read would break every screen:
// api.js fans out from that list to /api/courses/:id/... inside a
// Promise.all, so one 403 rejects the whole load.
//
// `alias` is always a literal written in this file's callers, never anything
// from a request. Every VALUE is still a bound parameter.
// ---------------------------------------------------------------------

/** True when the role sees everything and no filtering is needed at all. */
function seesEverything(faculty) {
  return faculty.role === "admin";
}

function courseScope(faculty, alias) {
  if (faculty.role === "admin") {
    return { sql: "1 = 1", params: [] };
  }

  if (faculty.role === "hod") {
    // A hod with no department recorded matches NOTHING. The alternative --
    // treating "unknown department" as "every department" -- would hand out
    // institution-wide write access by omission, which is the wrong way for
    // a missing value to fail. Empty string is treated as absent for the
    // same reason.
    if (!faculty.department) return { sql: "1 = 0", params: [] };

    // Compared as the COLUMN, so utf8mb4_unicode_ci decides: case- and
    // trailing-space-insensitive, which is what two hand-typed copies of
    // "Computer Science and Engineering" need.
    return { sql: `${alias}.department = ?`, params: [faculty.department] };
  }

  // 'faculty': allocated courses only. Either allocation role ('handling' or
  // 'incharge') counts -- both are ways of owning the course file.
  return {
    sql: `EXISTS (SELECT 1
                    FROM course_allocations AS scope_ca
                   WHERE scope_ca.course_id = ${alias}.id
                     AND scope_ca.faculty_id = ?)`,
    params: [faculty.id],
  };
}

/**
 * May this person touch this one course?
 *
 * An admin gets `true` WITHOUT checking the course exists, so a bad id still
 * reaches the handler and still gets its own 404. For everybody else a course
 * that does not exist is indistinguishable from one they may not reach, and
 * both are 403 -- there is no reason to let an unallocated caller enumerate
 * which course ids are real.
 */
async function canAccessCourse(faculty, courseId) {
  if (seesEverything(faculty)) return true;

  const scope = courseScope(faculty, "c");
  const [rows] = await pool.execute(
    `SELECT 1 FROM courses AS c WHERE c.id = ? AND ${scope.sql} LIMIT 1`,
    [courseId, ...scope.params]
  );
  return rows.length > 0;
}

/** The 403 for a course, worded for the reason it was refused. */
function courseForbidden(faculty, courseId) {
  if (faculty.role === "hod") {
    if (!faculty.department) {
      return new HttpError(
        403,
        "Your account has no department recorded, so it can reach no courses. Ask the department to set it."
      );
    }
    return new HttpError(
      403,
      `Course ${courseId} is not in your department (${faculty.department}).`
    );
  }
  return new HttpError(403, `You are not allocated to course ${courseId}.`);
}

/**
 * Gate every route under a `/:id` course prefix.
 *
 * Mounted with router.use, so it covers routes added LATER without anybody
 * having to remember. The id is validated here too, so a non-numeric one is
 * the same 400 requireId would have given rather than a confusing 403.
 */
const requireCourseAccess = asyncHandler(async (req, res, next) => {
  const courseId = parseId(req.params.id);
  if (courseId === null) {
    throw new HttpError(400, "Invalid id: must be a positive integer");
  }
  if (!(await canAccessCourse(req.faculty, courseId))) {
    throw courseForbidden(req.faculty, courseId);
  }
  next();
});

/**
 * The same gate for an assessment, which inherits its course's permissions --
 * a mark sheet is part of a course file, not a thing owned separately.
 */
const requireAssessmentAccess = asyncHandler(async (req, res, next) => {
  const assessmentId = parseId(req.params.id);
  if (assessmentId === null) {
    throw new HttpError(400, "Invalid id: must be a positive integer");
  }

  const [rows] = await pool.execute(
    "SELECT course_id FROM assessments WHERE id = ?",
    [assessmentId]
  );

  if (rows.length === 0) {
    // Admin falls through to the handler's own 404. For anyone else a
    // non-existent assessment and someone else's assessment answer alike.
    if (seesEverything(req.faculty)) {
      next();
      return;
    }
    throw new HttpError(403, `You may not reach assessment ${assessmentId}.`);
  }

  const courseId = rows[0].course_id;
  if (!(await canAccessCourse(req.faculty, courseId))) {
    throw courseForbidden(req.faculty, courseId);
  }
  next();
});

// ---------------------------------------------------------------------
// DEPARTMENT SCOPE, for the reference data that is not course-scoped
// ---------------------------------------------------------------------

/**
 * Does this person's OWN faculty row carry this department?
 *
 * Asked of MySQL rather than compared in JavaScript on purpose: the
 * comparison then happens in the column's own utf8mb4_unicode_ci collation,
 * exactly as the hod course check does. A JS `toLowerCase()` would agree for
 * ASCII names and quietly disagree for an accented one.
 */
async function isOwnDepartment(conn, faculty, department) {
  const [rows] = await conn.execute(
    "SELECT 1 FROM faculty WHERE id = ? AND department = ? LIMIT 1",
    [faculty.id, department]
  );
  return rows.length > 0;
}

/**
 * Throw unless this person may write reference data for `department`.
 *
 *   department null -> institution-wide (the institution vision, and the
 *                     PEOs that apply to every department). ADMIN ONLY: it
 *                     is the one text every printed course file in the
 *                     institution shares.
 *   a department    -> the hod OF THAT DEPARTMENT, or an admin.
 *
 * Never the caller's claimed department -- the body says which department is
 * being edited, and this checks that claim against the signed-in row.
 *
 * Takes the CONNECTION, not the pool: every caller is inside a transaction,
 * and withTransaction's contract is that queries in one use its connection.
 */
async function assertDepartmentWrite(conn, faculty, department) {
  if (seesEverything(faculty)) return;

  if (department === null) {
    throw new HttpError(
      403,
      "Institution-wide reference data may only be changed by an admin."
    );
  }

  if (faculty.role !== "hod") {
    throw new HttpError(
      403,
      `Changing a department's reference data needs the hod or admin role. Your account is '${faculty.role}'.`
    );
  }

  if (!faculty.department) {
    throw new HttpError(
      403,
      "Your account has no department recorded, so it can change no department's reference data. Ask the department to set it."
    );
  }

  if (!(await isOwnDepartment(conn, faculty, department))) {
    throw new HttpError(
      403,
      `You may only change reference data for your own department (${faculty.department}).`
    );
  }
}

/**
 * May this person read another faculty member's allocation list?
 * Yourself, the hod of your department, or an admin.
 */
async function canReadFacultyCourses(faculty, targetId) {
  if (seesEverything(faculty)) return true;
  if (faculty.id === targetId) return true;
  if (faculty.role !== "hod" || !faculty.department) return false;

  // Same collation-in-the-column reasoning as isOwnDepartment. A target with
  // a NULL department never matches, which is the safe direction.
  const [rows] = await pool.execute(
    "SELECT 1 FROM faculty WHERE id = ? AND department = ? LIMIT 1",
    [targetId, faculty.department]
  );
  return rows.length > 0;
}

module.exports = {
  signToken,
  requireAuth,
  requireRole,
  seesEverything,
  courseScope,
  canAccessCourse,
  courseForbidden,
  requireCourseAccess,
  requireAssessmentAccess,
  assertDepartmentWrite,
  canReadFacultyCourses,
};
