// ---------------------------------------------------------------
// BEGIN REMOVABLE BLOCK -- admin Users screen (server half)
//
// Routes mounted at /api/admin
//
//   GET  /api/admin/users      - every faculty row, with sign-in counts (admin)
//   POST /api/admin/users      - create one faculty account            (admin)
//   PUT  /api/admin/users/:id  - edit name/department/role/isActive    (admin)
//
// Delete this file and its one mount line in index.js to remove the feature.
// Nothing else on the server imports it.
//
//
// ADMIN ONLY, ON EVERY ROUTE.
//   requireRole('admin') is written on each of the three routes rather than
//   once with router.use, so a route added here later cannot inherit the
//   guard by accident and has to say what it needs. Authentication itself is
//   already settled by the requireAuth gate in index.js, so a request with no
//   bearer token never reaches this file at all -- it is a 401 from there.
//
//
// THE CALLER IS READ FROM THE TOKEN, NEVER FROM THE BODY.
//   The two lockout guards on PUT compare against req.faculty.id, which only
//   requireAuth writes and which it re-reads from the database on every
//   request. Nothing here trusts an id, a role or an email sent by the client.
//
//
// WHY THIS IS THE FIRST POST IN THE APP.
//   Every other write in the portal replaces a whole sheet at a known address,
//   which is what PUT means. Creating a faculty account is different: the
//   address does not exist yet, and the server assigns it. That is a POST.
//
//
// EMAIL IS SET ONCE AND NEVER EDITED.
//   It is the identity Google signs in with and the unique key the sign-in
//   endpoint looks up. Changing it here would silently move an account to a
//   different person, so PUT refuses it outright rather than ignoring it --
//   see the note on the PUT handler.
// ---------------------------------------------------------------

const express = require("express");
require("dotenv").config();
const pool = require("../db");
const {
  asyncHandler,
  HttpError,
  ValidationError,
  withTransaction,
  bool,
  requireId,
  isPlainObject,
  optionalString,
  // BEGIN REMOVABLE -- Courses and Allocations screens
  num,
  optionalNumber,
  // END REMOVABLE -- Courses and Allocations screens
  // BEGIN REMOVABLE -- admin Course Setup screen
  parseId,
  isDateString,
  // END REMOVABLE -- admin Course Setup screen
} = require("../helpers");
const { requireRole } = require("../auth");

const router = express.Router();

// The one domain a portal account may belong to. Read here rather than
// imported from routes/auth.js, which exports only its router.
const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "").trim().toLowerCase();

// The ENUM migration 013 declared, in the same order. A value not in this
// list is rejected here rather than left to MySQL, so a typo is a 400 naming
// the field instead of a 500 from a rejected write.
const ROLES = ["faculty", "hod", "admin"];

// Column widths from migration 006. Checked here so an over-long value is a
// 400 naming the field rather than a truncation error.
const NAME_MAX = 120;
const EMAIL_MAX = 160;
const DEPARTMENT_MAX = 100;

// ---------------------------------------------------------------------
// last_login_at is DATETIME, and mysql2 hands a DATETIME back as a JavaScript
// Date built in the SERVER PROCESS's zone. JSON.stringify then writes it as
// UTC, so a 00:30 IST sign-in reads back as the previous day.
//
// DATE_FORMAT keeps it a STRING all the way to the browser: the characters
// the database holds, unshifted, unparsed and unzoned. The client renders
// them as-is and never constructs a Date from this field.
// ---------------------------------------------------------------------
const LAST_LOGIN_SELECT =
  "DATE_FORMAT(f.last_login_at, '%Y-%m-%d %H:%i:%s') AS last_login_at";

// ---------------------------------------------------------------------
// BEGIN REMOVABLE -- department picker
//
// WHY THE DEPARTMENT LIST INCLUDES `courses` AND NOT JUST `faculty`
//   HoD scoping in ../auth.js compares faculty.department to
//   courses.department by equality. A department that exists only on a course
//   therefore has to be offerable, or the FIRST member of staff assigned to it
//   could never be given it -- and a hod with no matching department matches
//   nothing at all.
//
// WHY THE MATCHING IS DONE IN SQL AND NOT IN JAVASCRIPT
//   `d = ?` below compares in the COLUMN's own utf8mb4_unicode_ci collation,
//   which is the exact comparison courseScope() uses to decide what a hod may
//   reach. A JavaScript toLowerCase() would agree for ASCII and quietly
//   disagree for an accented name, so the picker would offer a "new"
//   department that the scoping rules already treat as an existing one.
//
// WHY A DETERMINISTIC REPRESENTATIVE
//   GROUP BY d groups case-insensitively, so 'Biotechnology' and
//   'biotechnology' fall in one group. Which SPELLING then represents that
//   group has to be decided, or the list and the canonicaliser could disagree
//   and store one spelling while offering another. MIN(... COLLATE
//   utf8mb4_bin) picks by byte order: arbitrary, but the SAME arbitrary answer
//   every time and in both queries below, which is what matters.
// ---------------------------------------------------------------------
const DEPARTMENT_SOURCE = `
    SELECT TRIM(f.department) AS d FROM faculty AS f
     WHERE f.department IS NOT NULL AND TRIM(f.department) <> ''
    UNION ALL
    SELECT TRIM(c.department) AS d FROM courses AS c
     WHERE c.department IS NOT NULL AND TRIM(c.department) <> ''`;

/** Every department in use, trimmed, case-insensitively unique, sorted. */
async function listDepartments(runner) {
  const [rows] = await runner.query(
    `SELECT MIN(d COLLATE utf8mb4_bin) AS department
       FROM (${DEPARTMENT_SOURCE}) AS src
      GROUP BY d
      ORDER BY department COLLATE utf8mb4_unicode_ci`
  );
  return rows.map((r) => r.department);
}

/**
 * The spelling already in use for this department, or the typed value.
 *
 * THIS, NOT THE DROPDOWN, IS WHAT PREVENTS NEAR-DUPLICATES. The screen's
 * "Add new department" box accepts anything, and a client can post whatever
 * it likes regardless of what the screen offered. So every write asks the
 * database whether it already knows this department under some other
 * capitalisation, and stores the spelling that is already there.
 *
 * null in, null out: "not recorded" is a real state and is not a department.
 *
 * Takes the CONNECTION: both callers are inside a transaction, and the answer
 * has to be read on the same connection that is about to do the write.
 */
async function canonicalDepartment(conn, value) {
  if (value === null) return null;
  const [rows] = await conn.query(
    `SELECT MIN(d COLLATE utf8mb4_bin) AS department
       FROM (${DEPARTMENT_SOURCE}) AS src
      WHERE d = ?`,
    [value]
  );
  // MIN() over no rows is one row holding NULL, not zero rows.
  return rows[0].department === null ? value : rows[0].department;
}
// END REMOVABLE -- department picker

/**
 * The domain of an email address: everything after the LAST '@', lowercased.
 *
 * The last '@' matters. A local part may legally contain a quoted '@', so
 * splitting on the first one would let "a@bitsathy.ac.in"@evil.com read as
 * the allowed domain. Same rule the sign-in endpoint applies, deliberately
 * duplicated rather than reaching into that file: an account created here
 * that sign-in would then refuse is worse than nine lines of repetition.
 */
function domainOf(email) {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain === "" ? null : domain;
}

/** A faculty row -> the JSON the Users screen reads. camelCase throughout. */
function mapUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    role: row.role,
    isActive: bool(row.is_active),
    lastLoginAt: row.last_login_at,
    signInCount: Number(row.sign_in_count),
  };
}

/** Read one user by id in the caller's transaction, or throw 404. */
async function loadUser(conn, id) {
  const [rows] = await conn.execute(
    `SELECT f.id, f.name, f.email, f.department, f.role, f.is_active, ${LAST_LOGIN_SELECT},
            (SELECT COUNT(*) FROM login_events AS e WHERE e.faculty_id = f.id) AS sign_in_count
       FROM faculty AS f
      WHERE f.id = ?`,
    [id]
  );
  if (rows.length === 0) {
    throw new HttpError(404, `No faculty member with id ${id}`);
  }
  return rows[0];
}

// ---------------------------------------------------------------------
// GET /api/admin/users
//
// EVERY row, active and inactive alike. This is the screen that MANAGES
// accounts, so an account it cannot see is one it cannot reactivate --
// which is the opposite of GET /api/faculty, whose is_active = 1 filter is
// there because that endpoint offers a CHOICE of who to allocate.
//
// signInCount is a correlated COUNT over login_events rather than a LEFT
// JOIN with GROUP BY: the join would multiply the faculty row by its event
// count before collapsing it, and every other column here would have to be
// carried through the GROUP BY for no gain. login_events is indexed on
// faculty_id by its foreign key, so the subquery is a key lookup per row.
//
// A count of 0 means "no sign-in RECORDED", not "never used the portal" --
// migration 018 seeded nothing, so nothing before login tracking was
// switched on is in the table. The screen says so.
// ---------------------------------------------------------------------
router.get(
  "/users",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT f.id, f.name, f.email, f.department, f.role, f.is_active, ${LAST_LOGIN_SELECT},
              (SELECT COUNT(*) FROM login_events AS e WHERE e.faculty_id = f.id) AS sign_in_count
         FROM faculty AS f
        ORDER BY f.name`
    );

    res.json(rows.map(mapUser));
  })
);

// ---------------------------------------------------------------------
// BEGIN REMOVABLE -- department picker
//
// GET /api/admin/departments
//
// A plain array of strings, so the screen can drop it straight into a select
// without unwrapping anything. Empty array when no department is recorded
// anywhere, which is a legitimate state and not an error.
//
// Admin only, like everything else in this file. It reads no personal data --
// only the set of department names -- but it is part of the accounts screen
// and there is no reason to widen it.
// ---------------------------------------------------------------------
router.get(
  "/departments",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    res.json(await listDepartments(pool));
  })
);
// END REMOVABLE -- department picker

// ---------------------------------------------------------------------
// POST /api/admin/users
//
// Body: { name, email, department, role }
//
// Every rule below is enforced HERE, on the server. The screen applies the
// same ones so the user is told early, but nothing about this handler
// depends on the screen having done so.
//
//   400  the body is not shaped like a user, or a field fails validation.
//        Carries `issues`, one entry per offending field, built BEFORE the
//        insert -- a rejected create writes nothing at all.
//   409  that email is already on a faculty row. NOT a 500: a duplicate is
//        an ordinary thing for an admin to try, and the answer is the
//        sentence saying so, not an internal error.
//
// WHY THE DOMAIN IS CHECKED AT ALL
//   An account outside the allowed domain could never sign in -- the Google
//   endpoint refuses it before it ever looks at the faculty table. Creating
//   one would leave a row that looks like an account and is not, so it is
//   refused at the point of creation instead.
// ---------------------------------------------------------------------
router.post(
  "/users",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!isPlainObject(body)) {
      throw new HttpError(400, "Body must be a JSON object");
    }

    const issues = [];

    // ---- name: required ----
    const name = optionalString(body.name, NAME_MAX);
    if (!name.ok) {
      issues.push({ field: "name", message: `name must be text of at most ${NAME_MAX} characters` });
    } else if (name.value === null) {
      issues.push({ field: "name", message: "name is required" });
    }

    // ---- email: required, allowed domain, stored lowercased ----
    let email = null;
    if (typeof body.email !== "string" || body.email.trim() === "") {
      issues.push({ field: "email", message: "email is required" });
    } else {
      const trimmed = body.email.trim().toLowerCase();
      if (trimmed.length > EMAIL_MAX) {
        issues.push({
          field: "email",
          message: `email must be at most ${EMAIL_MAX} characters`,
        });
      } else if (ALLOWED_DOMAIN === "") {
        // No configured domain means there is no rule to check against, and
        // guessing one would let through exactly what this check exists to
        // stop. Refuse rather than accept unverifiably.
        issues.push({
          field: "email",
          message:
            "This server has no ALLOWED_EMAIL_DOMAIN configured, so no account can be created.",
        });
      } else if (domainOf(trimmed) !== ALLOWED_DOMAIN) {
        issues.push({
          field: "email",
          message: `email must be an @${ALLOWED_DOMAIN} address`,
        });
      } else {
        email = trimmed;
      }
    }

    // ---- department: optional, may be null ----
    const department = optionalString(body.department, DEPARTMENT_MAX);
    if (!department.ok) {
      issues.push({
        field: "department",
        message: `department must be text of at most ${DEPARTMENT_MAX} characters`,
      });
    }

    // ---- role: optional, defaults to the least privilege ----
    let role = "faculty";
    if (body.role !== undefined && body.role !== null && body.role !== "") {
      if (typeof body.role !== "string" || !ROLES.includes(body.role)) {
        issues.push({ field: "role", message: `role must be one of ${ROLES.join(", ")}` });
      } else {
        role = body.role;
      }
    }

    if (issues.length > 0) throw new ValidationError(issues);

    const created = await withTransaction(async (conn) => {
      // Checked inside the transaction so the message is the accurate one for
      // an ordinary duplicate. The UNIQUE key uq_faculty_email is still what
      // GUARANTEES it -- see the catch below, which covers the race this
      // SELECT cannot.
      const [clash] = await conn.execute(
        "SELECT id FROM faculty WHERE email = ? LIMIT 1",
        [email]
      );
      if (clash.length > 0) {
        throw new HttpError(409, `A faculty account already exists for ${email}`);
      }

      // BEGIN REMOVABLE -- department picker. optionalString already trimmed
      // this and turned '' into null; this settles the SPELLING against what
      // the database already holds. Read inside the transaction so it cannot
      // race a concurrent create of the same department.
      const storedDepartment = await canonicalDepartment(conn, department.value);
      // END REMOVABLE -- department picker

      let result;
      try {
        [result] = await conn.execute(
          `INSERT INTO faculty (name, email, department, role, is_active)
                VALUES (?, ?, ?, ?, 1)`,
          [name.value, email, storedDepartment, role]
        );
      } catch (err) {
        // Two admins creating the same address at once. The unique key caught
        // it; report it as the same 409 rather than a 500.
        if (err && err.code === "ER_DUP_ENTRY") {
          throw new HttpError(409, `A faculty account already exists for ${email}`);
        }
        throw err;
      }

      return loadUser(conn, result.insertId);
    });

    res.status(201).json(mapUser(created));
  })
);

// ---------------------------------------------------------------------
// PUT /api/admin/users/:id
//
// Body: any of { name, department, role, isActive }. A field that is absent
// is left alone, so the active toggle sends one key and the edit panel sends
// the rest without the two having to agree on a whole-row shape.
//
// EMAIL IS REFUSED RATHER THAN IGNORED.
//   Sending `email` is a 400. Dropping it silently would answer 200 to a
//   request that did not do what it asked, and the admin would believe an
//   address had been changed when it had not.
//
// THE TWO LOCKOUT GUARDS.
//   An admin may not take their own admin role away, and may not deactivate
//   themselves. Either one, done by the last admin, would leave the
//   institution with a Users screen nobody can open and no way back except a
//   hand-run UPDATE -- which is the thing this feature exists to avoid.
//
//   Both compare req.faculty.id, read from the verified token and re-read
//   from the database by requireAuth, against the id in the path. Neither
//   looks at anything in the body.
//
//   They are deliberately narrow: an admin may still edit their own name and
//   department, and may still demote or deactivate any OTHER account,
//   including another admin. Guarding more than the self-lockout case would
//   be inventing policy the institution did not ask for.
// ---------------------------------------------------------------------
router.put(
  "/users/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = requireId(req);

    const body = req.body;
    if (!isPlainObject(body)) {
      throw new HttpError(400, "Body must be a JSON object");
    }

    const issues = [];
    const isSelf = req.faculty.id === id;

    if (body.email !== undefined) {
      issues.push({
        field: "email",
        message:
          "email cannot be changed. It is the address Google signs in with; create a new account instead.",
      });
    }

    // ---- name ----
    let name;
    if (body.name !== undefined) {
      const parsed = optionalString(body.name, NAME_MAX);
      if (!parsed.ok) {
        issues.push({
          field: "name",
          message: `name must be text of at most ${NAME_MAX} characters`,
        });
      } else if (parsed.value === null) {
        issues.push({ field: "name", message: "name is required" });
      } else {
        name = parsed.value;
      }
    }

    // ---- department (null is a legitimate value: "not recorded") ----
    let department;
    if (body.department !== undefined) {
      const parsed = optionalString(body.department, DEPARTMENT_MAX);
      if (!parsed.ok) {
        issues.push({
          field: "department",
          message: `department must be text of at most ${DEPARTMENT_MAX} characters`,
        });
      } else {
        department = parsed.value;
      }
    }

    // ---- role, with the first lockout guard ----
    let role;
    if (body.role !== undefined) {
      if (typeof body.role !== "string" || !ROLES.includes(body.role)) {
        issues.push({ field: "role", message: `role must be one of ${ROLES.join(", ")}` });
      } else if (isSelf && body.role !== "admin") {
        issues.push({
          field: "role",
          message:
            "You cannot change your own role away from admin. Ask another admin to do it.",
        });
      } else {
        role = body.role;
      }
    }

    // ---- isActive, with the second lockout guard ----
    let isActive;
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        issues.push({ field: "isActive", message: "isActive must be true or false" });
      } else if (isSelf && body.isActive === false) {
        issues.push({
          field: "isActive",
          message:
            "You cannot deactivate your own account. Ask another admin to do it.",
        });
      } else {
        isActive = body.isActive;
      }
    }

    if (issues.length > 0) throw new ValidationError(issues);

    const updated = await withTransaction(async (conn) => {
      // 404 before anything is written, and inside the transaction so the row
      // cannot be deleted between the check and the UPDATE.
      await loadUser(conn, id);

      const sets = [];
      const params = [];
      if (name !== undefined) {
        sets.push("name = ?");
        params.push(name);
      }
      if (department !== undefined) {
        sets.push("department = ?");
        // BEGIN REMOVABLE -- department picker. Same canonicalisation as the
        // create path, for the same reason: an update must not introduce a
        // second spelling of a department that already exists.
        params.push(await canonicalDepartment(conn, department));
        // END REMOVABLE -- department picker
      }
      if (role !== undefined) {
        sets.push("role = ?");
        params.push(role);
      }
      if (isActive !== undefined) {
        sets.push("is_active = ?");
        params.push(isActive ? 1 : 0);
      }

      // An empty body is not an error -- it asked for no change and got none.
      // Skipping the UPDATE also leaves updated_at alone, which is honest:
      // nothing about the record changed.
      if (sets.length > 0) {
        await conn.execute(
          `UPDATE faculty SET ${sets.join(", ")} WHERE id = ?`,
          [...params, id]
        );
      }

      return loadUser(conn, id);
    });

    res.json(mapUser(updated));
  })
);

// =====================================================================
// BEGIN REMOVABLE BLOCK -- Courses and Allocations screens (server half)
//
//   GET    /api/admin/courses          - every course, with allocation count
//   POST   /api/admin/courses          - create a course
//   PUT    /api/admin/courses/:id      - edit one, partially
//   GET    /api/admin/allocations      - every allocation, with both sides
//   POST   /api/admin/allocations      - assign a faculty member to a course
//   DELETE /api/admin/allocations/:id  - remove one assignment
//
// Admin only, every one of them, for the same reasons as the Users routes
// above: authentication is settled by the requireAuth gate in index.js, and
// requireRole('admin') is written on each route rather than once with
// router.use so a route added later has to say what it needs.
//
// WHY THERE IS NO DELETE FOR A COURSE
//   course_allocations, student_enrolments, assessments and every mark row
//   hang off a course, several of them ON DELETE CASCADE. A delete button
//   here would therefore be a button that silently destroys a term's marks,
//   and no confirmation dialog makes that safe. Retiring a course is a
//   different feature -- it needs a flag and a decision about what the
//   printed file shows -- and it is not this one.
//
// WHY co_target_percent IS REQUIRED ON CREATE
//   The column has NO default, deliberately: every attainment figure in the
//   app is computed against it, and a guessed target would silently change
//   what every CO level reads. A missing value is refused here with a 400
//   naming the field rather than being filled in.
// =====================================================================

// Column widths from migrations 003 and 012.
const CODE_MAX = 20;
const TITLE_MAX = 200;
const PROGRAMME_MAX = 120;
const BATCH_MAX = 20;
const ACADEMIC_YEAR_MAX = 20;
const YEAR_OF_STUDY_MAX = 20;
const SEMESTER_MAX = 10;
const SECTION_MAX = 10;

// The ENUM migration 006 declared on course_allocations.role. Checked here so
// a bad value is a 400 naming the field rather than a 500 from a refused write.
const ALLOCATION_ROLES = ["handling", "incharge"];

// The optional text columns a course carries, all NULLable, all "not recorded
// yet" when absent. One table so create and update cannot disagree about
// which fields exist or how long they may be.
const COURSE_TEXT_FIELDS = [
  { body: "programme", column: "programme", max: PROGRAMME_MAX },
  { body: "batch", column: "batch", max: BATCH_MAX },
  { body: "academicYear", column: "academic_year", max: ACADEMIC_YEAR_MAX },
  { body: "yearOfStudy", column: "year_of_study", max: YEAR_OF_STUDY_MAX },
  { body: "semester", column: "semester", max: SEMESTER_MAX },
  { body: "section", column: "section", max: SECTION_MAX },
];

const ADMIN_COURSE_SELECT = `
  c.id, c.code, c.title, c.nature_id, n.name AS nature_name,
  c.co_target_percent, c.co_count, c.department, c.programme, c.batch,
  c.academic_year, c.year_of_study, c.semester, c.section,
  (SELECT COUNT(*) FROM course_allocations AS ca WHERE ca.course_id = c.id)
    AS allocation_count
`;

/** A courses row joined to its nature -> the JSON the Courses screen reads. */
function mapAdminCourse(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    natureId: row.nature_id,
    natureName: row.nature_name,
    coTargetPercent: num(row.co_target_percent),
    coCount: row.co_count,
    department: row.department,
    programme: row.programme,
    batch: row.batch,
    academicYear: row.academic_year,
    yearOfStudy: row.year_of_study,
    semester: row.semester,
    section: row.section,
    allocationCount: Number(row.allocation_count),
  };
}

/** Read one course by id in the caller's transaction, or throw 404. */
async function loadCourse(conn, id) {
  const [rows] = await conn.execute(
    `SELECT ${ADMIN_COURSE_SELECT}
       FROM courses AS c
       JOIN course_natures AS n ON n.id = c.nature_id
      WHERE c.id = ?`,
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, `No course with id ${id}`);
  return rows[0];
}

/**
 * Validate a nature id against course_natures.
 *
 * A foreign key would refuse a bad one anyway, but as a 500 from a rejected
 * write. This turns it into a 400 that names the field and lists what is
 * actually on offer.
 */
async function readNature(conn, natureId) {
  const [rows] = await conn.execute(
    "SELECT id, name FROM course_natures WHERE id = ?",
    [natureId]
  );
  return rows.length === 0 ? null : rows[0];
}

// ---------------------------------------------------------------------
// GET /api/admin/courses
//
// EVERY course. Unlike GET /api/courses, which narrows to what the caller may
// reach, this one is the management view and an admin sees everything anyway.
//
// allocationCount is a correlated COUNT rather than a JOIN with GROUP BY: the
// join would multiply each course by its allocation count before collapsing
// it, and every other column would have to be carried through the GROUP BY
// for no gain. course_allocations is indexed on course_id.
//
// A count of 0 means nobody is assigned to teach it, which is a real and
// visible state -- the screen says so rather than leaving the cell blank.
// ---------------------------------------------------------------------
router.get(
  "/courses",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT ${ADMIN_COURSE_SELECT}
         FROM courses AS c
         JOIN course_natures AS n ON n.id = c.nature_id
        ORDER BY c.code`
    );
    res.json(rows.map(mapAdminCourse));
  })
);

// ---------------------------------------------------------------------
// POST /api/admin/courses
//
// Body: { code, title, natureId, coTargetPercent, department, programme,
//         batch, academicYear, yearOfStudy, semester, section }
//
//   400  a field failed validation. Carries `issues`, built BEFORE the insert.
//   409  that code already belongs to a course. An ordinary thing for an
//        admin to try, so it is the sentence saying so and not a 500.
//
// co_count and regulation_year are deliberately NOT settable here. Both have
// sensible column defaults, neither appears on the screen, and inventing a
// route for them would mean guessing what an admin meant by leaving them out.
// ---------------------------------------------------------------------
router.post(
  "/courses",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");

    const issues = [];

    const code = optionalString(body.code, CODE_MAX);
    if (!code.ok) {
      issues.push({ field: "code", message: `code must be text of at most ${CODE_MAX} characters` });
    } else if (code.value === null) {
      issues.push({ field: "code", message: "code is required" });
    }

    const title = optionalString(body.title, TITLE_MAX);
    if (!title.ok) {
      issues.push({ field: "title", message: `title must be text of at most ${TITLE_MAX} characters` });
    } else if (title.value === null) {
      issues.push({ field: "title", message: "title is required" });
    }

    // ---- natureId: required, and must name a real course_natures row ----
    const nature = optionalNumber(body.natureId);
    if (!nature.ok || (nature.value !== null && !Number.isInteger(nature.value))) {
      issues.push({ field: "natureId", message: "natureId must be a whole number" });
    } else if (nature.value === null) {
      issues.push({ field: "natureId", message: "natureId is required" });
    }

    // ---- coTargetPercent: required, 1 to 100. NO DEFAULT, ever. ----
    const target = optionalNumber(body.coTargetPercent);
    if (!target.ok) {
      issues.push({ field: "coTargetPercent", message: "coTargetPercent must be a number" });
    } else if (target.value === null) {
      issues.push({
        field: "coTargetPercent",
        message:
          "coTargetPercent is required. Every attainment figure is computed against it, so it is never defaulted.",
      });
    } else if (target.value < 1 || target.value > 100) {
      issues.push({ field: "coTargetPercent", message: "coTargetPercent must be between 1 and 100" });
    }

    const department = optionalString(body.department, DEPARTMENT_MAX);
    if (!department.ok) {
      issues.push({
        field: "department",
        message: `department must be text of at most ${DEPARTMENT_MAX} characters`,
      });
    }

    const text = {};
    for (const field of COURSE_TEXT_FIELDS) {
      const parsed = optionalString(body[field.body], field.max);
      if (!parsed.ok) {
        issues.push({
          field: field.body,
          message: `${field.body} must be text of at most ${field.max} characters`,
        });
      } else {
        text[field.column] = parsed.value;
      }
    }

    if (issues.length > 0) throw new ValidationError(issues);

    const created = await withTransaction(async (conn) => {
      if ((await readNature(conn, nature.value)) === null) {
        const [all] = await conn.execute("SELECT id, name FROM course_natures ORDER BY id");
        throw new ValidationError([
          {
            field: "natureId",
            message: `No course nature with id ${nature.value}. Available: ${all
              .map((n) => `${n.id} (${n.name})`)
              .join(", ")}`,
          },
        ]);
      }

      const [clash] = await conn.execute("SELECT id FROM courses WHERE code = ? LIMIT 1", [
        code.value,
      ]);
      if (clash.length > 0) {
        throw new HttpError(409, `A course already exists with code ${code.value}`);
      }

      // Same canonicalisation the Users screen writes through, so a course and
      // a faculty row can never disagree about how a department is spelt --
      // which is what hod scoping compares.
      const storedDepartment = await canonicalDepartment(conn, department.value);

      let result;
      try {
        [result] = await conn.execute(
          `INSERT INTO courses
             (code, title, nature_id, co_target_percent, department,
              programme, batch, academic_year, year_of_study, semester, section)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            code.value,
            title.value,
            nature.value,
            target.value,
            storedDepartment,
            text.programme,
            text.batch,
            text.academic_year,
            text.year_of_study,
            text.semester,
            text.section,
          ]
        );
      } catch (err) {
        // Two admins creating the same code at once; the unique key caught it.
        if (err && err.code === "ER_DUP_ENTRY") {
          throw new HttpError(409, `A course already exists with code ${code.value}`);
        }
        throw err;
      }

      return loadCourse(conn, result.insertId);
    });

    res.status(201).json(mapAdminCourse(created));
  })
);

// ---------------------------------------------------------------------
// PUT /api/admin/courses/:id
//
// Partial: an absent field is left alone, so the inline editor can send the
// three fields it shows without having to round-trip the rest.
//
// CODE IS REFUSED, NOT IGNORED.
//   The code is what every printed course file, every report and every human
//   uses to name this course. Renaming it silently through an edit box would
//   be indistinguishable from creating a different course, so sending `code`
//   is a 400 rather than a quietly dropped field.
//
// CHANGING THE NATURE IS ALLOWED AND IS REPORTED BACK.
//   The nature carries the mark scale -- pt1Max, pt2Max, ipMax, intTotal,
//   seeTotal and the low-internal-mark threshold. Changing it re-scales every
//   attainment figure already computed for this course WITHOUT touching a
//   single stored mark, so the numbers on the printed file move while the mark
//   sheets stay as they were. That is a legitimate correction and it is
//   allowed, but the response carries `natureChanged` so the screen can say
//   out loud what just happened rather than letting it pass as an ordinary
//   field edit.
// ---------------------------------------------------------------------
router.put(
  "/courses/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = requireId(req);

    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");

    const issues = [];

    if (body.code !== undefined) {
      issues.push({
        field: "code",
        message:
          "code cannot be changed. It names this course on every printed file and report; create a new course instead.",
      });
    }

    let title;
    if (body.title !== undefined) {
      const parsed = optionalString(body.title, TITLE_MAX);
      if (!parsed.ok) {
        issues.push({ field: "title", message: `title must be text of at most ${TITLE_MAX} characters` });
      } else if (parsed.value === null) {
        issues.push({ field: "title", message: "title is required" });
      } else {
        title = parsed.value;
      }
    }

    let natureId;
    if (body.natureId !== undefined) {
      const parsed = optionalNumber(body.natureId);
      if (!parsed.ok || parsed.value === null || !Number.isInteger(parsed.value)) {
        issues.push({ field: "natureId", message: "natureId must be a whole number" });
      } else {
        natureId = parsed.value;
      }
    }

    let coTargetPercent;
    if (body.coTargetPercent !== undefined) {
      const parsed = optionalNumber(body.coTargetPercent);
      if (!parsed.ok || parsed.value === null) {
        issues.push({
          field: "coTargetPercent",
          message: "coTargetPercent must be a number, and is never cleared",
        });
      } else if (parsed.value < 1 || parsed.value > 100) {
        issues.push({ field: "coTargetPercent", message: "coTargetPercent must be between 1 and 100" });
      } else {
        coTargetPercent = parsed.value;
      }
    }

    let department;
    if (body.department !== undefined) {
      const parsed = optionalString(body.department, DEPARTMENT_MAX);
      if (!parsed.ok) {
        issues.push({
          field: "department",
          message: `department must be text of at most ${DEPARTMENT_MAX} characters`,
        });
      } else {
        department = parsed.value;
      }
    }

    const text = {};
    for (const field of COURSE_TEXT_FIELDS) {
      if (body[field.body] === undefined) continue;
      const parsed = optionalString(body[field.body], field.max);
      if (!parsed.ok) {
        issues.push({
          field: field.body,
          message: `${field.body} must be text of at most ${field.max} characters`,
        });
      } else {
        text[field.column] = parsed.value;
      }
    }

    if (issues.length > 0) throw new ValidationError(issues);

    const result = await withTransaction(async (conn) => {
      const before = await loadCourse(conn, id);

      let natureChanged = null;
      if (natureId !== undefined && natureId !== before.nature_id) {
        const target = await readNature(conn, natureId);
        if (target === null) {
          const [all] = await conn.execute("SELECT id, name FROM course_natures ORDER BY id");
          throw new ValidationError([
            {
              field: "natureId",
              message: `No course nature with id ${natureId}. Available: ${all
                .map((n) => `${n.id} (${n.name})`)
                .join(", ")}`,
            },
          ]);
        }
        natureChanged = {
          from: { id: before.nature_id, name: before.nature_name },
          to: { id: target.id, name: target.name },
        };
      }

      const sets = [];
      const params = [];
      if (title !== undefined) {
        sets.push("title = ?");
        params.push(title);
      }
      if (natureId !== undefined) {
        sets.push("nature_id = ?");
        params.push(natureId);
      }
      if (coTargetPercent !== undefined) {
        sets.push("co_target_percent = ?");
        params.push(coTargetPercent);
      }
      if (department !== undefined) {
        sets.push("department = ?");
        params.push(await canonicalDepartment(conn, department));
      }
      for (const field of COURSE_TEXT_FIELDS) {
        if (!(field.column in text)) continue;
        sets.push(`${field.column} = ?`);
        params.push(text[field.column]);
      }

      // An empty body asked for no change and gets none. Skipping the UPDATE
      // also leaves updated_at alone, which is honest.
      if (sets.length > 0) {
        await conn.execute(`UPDATE courses SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
      }

      return { course: await loadCourse(conn, id), natureChanged };
    });

    res.json({ ...mapAdminCourse(result.course), natureChanged: result.natureChanged });
  })
);

// ---------------------------------------------------------------------
// GET /api/admin/allocations
//
// Both sides joined in, because an allocation is meaningless as two integers:
// the screen has to show WHO is assigned to WHAT.
//
// INNER JOINs are safe here -- both columns are NOT NULL with foreign keys, so
// an allocation without a faculty row or without a course cannot exist.
//
// Ordered by course code then faculty name, so a course's people sit together
// and the screen needs no client-side grouping.
// ---------------------------------------------------------------------
router.get(
  "/allocations",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT ca.id, ca.faculty_id, f.name AS faculty_name, f.email AS faculty_email,
              f.is_active AS faculty_is_active,
              ca.course_id, c.code AS course_code, c.title AS course_title,
              ca.role, ca.academic_year, ca.semester, ca.section
         FROM course_allocations AS ca
         JOIN faculty AS f ON f.id = ca.faculty_id
         JOIN courses AS c ON c.id = ca.course_id
        ORDER BY c.code, f.name`
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        facultyId: r.faculty_id,
        facultyName: r.faculty_name,
        facultyEmail: r.faculty_email,
        facultyIsActive: bool(r.faculty_is_active),
        courseId: r.course_id,
        courseCode: r.course_code,
        courseTitle: r.course_title,
        role: r.role,
        academicYear: r.academic_year,
        semester: r.semester,
        section: r.section,
      }))
    );
  })
);

// ---------------------------------------------------------------------
// POST /api/admin/allocations
//
// Body: { facultyId, courseId, role, academicYear, semester, section }
//
//   404  the faculty member, or the course, does not exist. The message names
//        WHICH one, because "not found" on a two-sided write is useless.
//   400  the faculty member exists but is not active, or a field is invalid.
//   409  that exact allocation already exists.
//
// WHY AN INACTIVE MEMBER IS REFUSED
//   requireAuth rejects an inactive account on every request, so allocating
//   one creates a course nobody can open: it would show a name on the cover
//   sheet and grant access to a person who cannot sign in. Reactivate the
//   account first.
//
// WHY THE DUPLICATE CHECK IS NULL-SAFE AND NOT LEFT TO THE UNIQUE KEY
//   uq_course_allocations spans (faculty_id, course_id, role, academic_year,
//   semester, section), and THREE of those are NULLable. MySQL treats NULLs as
//   distinct in a unique key, so two rows with the same faculty, course and
//   role and a NULL academic_year both insert happily -- the key does not stop
//   them. The check below uses <=> on all six columns, which IS null-safe, so
//   a real duplicate is a 409 rather than a silent second row.
//
//   It matches the key's six columns exactly, and no fewer: the same person
//   may legitimately hold the same role on the same course in a different
//   academic year, and refusing that would be inventing a rule.
// ---------------------------------------------------------------------
router.post(
  "/allocations",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");

    const issues = [];

    const facultyId = optionalNumber(body.facultyId);
    if (!facultyId.ok || facultyId.value === null || !Number.isInteger(facultyId.value)) {
      issues.push({ field: "facultyId", message: "facultyId is required and must be a whole number" });
    }

    const courseId = optionalNumber(body.courseId);
    if (!courseId.ok || courseId.value === null || !Number.isInteger(courseId.value)) {
      issues.push({ field: "courseId", message: "courseId is required and must be a whole number" });
    }

    let role = "handling";
    if (body.role !== undefined && body.role !== null && body.role !== "") {
      if (typeof body.role !== "string" || !ALLOCATION_ROLES.includes(body.role)) {
        issues.push({ field: "role", message: `role must be one of ${ALLOCATION_ROLES.join(", ")}` });
      } else {
        role = body.role;
      }
    }

    const academicYear = optionalString(body.academicYear, ACADEMIC_YEAR_MAX);
    if (!academicYear.ok) {
      issues.push({
        field: "academicYear",
        message: `academicYear must be text of at most ${ACADEMIC_YEAR_MAX} characters`,
      });
    }
    const semester = optionalString(body.semester, SEMESTER_MAX);
    if (!semester.ok) {
      issues.push({ field: "semester", message: `semester must be text of at most ${SEMESTER_MAX} characters` });
    }
    const section = optionalString(body.section, SECTION_MAX);
    if (!section.ok) {
      issues.push({ field: "section", message: `section must be text of at most ${SECTION_MAX} characters` });
    }

    if (issues.length > 0) throw new ValidationError(issues);

    const created = await withTransaction(async (conn) => {
      const [facultyRows] = await conn.execute(
        "SELECT id, name, is_active FROM faculty WHERE id = ?",
        [facultyId.value]
      );
      if (facultyRows.length === 0) {
        throw new HttpError(404, `No faculty member with id ${facultyId.value}`);
      }
      if (!facultyRows[0].is_active) {
        throw new ValidationError([
          {
            field: "facultyId",
            message: `${facultyRows[0].name} is not an active account and cannot be allocated. Reactivate it on the Users screen first.`,
          },
        ]);
      }

      const [courseRows] = await conn.execute("SELECT id, code FROM courses WHERE id = ?", [
        courseId.value,
      ]);
      if (courseRows.length === 0) {
        throw new HttpError(404, `No course with id ${courseId.value}`);
      }

      // Null-safe on every column of the unique key -- see the note above.
      const [clash] = await conn.execute(
        `SELECT id FROM course_allocations
          WHERE faculty_id = ? AND course_id = ? AND role = ?
            AND academic_year <=> ? AND semester <=> ? AND section <=> ?
          LIMIT 1`,
        [facultyId.value, courseId.value, role, academicYear.value, semester.value, section.value]
      );
      if (clash.length > 0) {
        throw new HttpError(
          409,
          `${facultyRows[0].name} is already allocated to ${courseRows[0].code} as '${role}' for that term.`
        );
      }

      let result;
      try {
        [result] = await conn.execute(
          `INSERT INTO course_allocations
             (faculty_id, course_id, role, academic_year, semester, section)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [facultyId.value, courseId.value, role, academicYear.value, semester.value, section.value]
        );
      } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
          throw new HttpError(
            409,
            `${facultyRows[0].name} is already allocated to ${courseRows[0].code} as '${role}' for that term.`
          );
        }
        throw err;
      }

      const [rows] = await conn.execute(
        `SELECT ca.id, ca.faculty_id, f.name AS faculty_name, f.email AS faculty_email,
                f.is_active AS faculty_is_active,
                ca.course_id, c.code AS course_code, c.title AS course_title,
                ca.role, ca.academic_year, ca.semester, ca.section
           FROM course_allocations AS ca
           JOIN faculty AS f ON f.id = ca.faculty_id
           JOIN courses AS c ON c.id = ca.course_id
          WHERE ca.id = ?`,
        [result.insertId]
      );
      return rows[0];
    });

    res.status(201).json({
      id: created.id,
      facultyId: created.faculty_id,
      facultyName: created.faculty_name,
      facultyEmail: created.faculty_email,
      facultyIsActive: bool(created.faculty_is_active),
      courseId: created.course_id,
      courseCode: created.course_code,
      courseTitle: created.course_title,
      role: created.role,
      academicYear: created.academic_year,
      semester: created.semester,
      section: created.section,
    });
  })
);

// ---------------------------------------------------------------------
// DELETE /api/admin/allocations/:id
//
// The one destructive action in this file, and it is safe to expose because
// an allocation carries no data of its own -- it is a link, and re-adding it
// restores exactly what was removed. Nothing cascades from it.
//
// THE LAST-HANDLING GUARD
//   courseScope() in ../auth.js grants an ordinary faculty member access to a
//   course through course_allocations. Remove the last 'handling' row and the
//   course becomes reachable by nobody except an admin and the department's
//   hod: it vanishes from every faculty member's dashboard, its mark sheets
//   stop being editable, and NOTHING in the app reports that this has
//   happened. There is no screen anywhere that lists orphaned courses.
//
//   So the last one is refused with a 400 that says what to do instead:
//   allocate the replacement first, then remove the outgoing member. That
//   ordering leaves the course reachable at every moment.
//
//   'incharge' is deliberately NOT guarded. It records who owns the course
//   FILE, not who may reach the course, so a course without one is untidy
//   rather than invisible -- and the cover sheet already prints a placeholder
//   for it.
// ---------------------------------------------------------------------
router.delete(
  "/allocations/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const id = requireId(req);

    const removed = await withTransaction(async (conn) => {
      const [rows] = await conn.execute(
        `SELECT ca.id, ca.faculty_id, f.name AS faculty_name,
                ca.course_id, c.code AS course_code, ca.role
           FROM course_allocations AS ca
           JOIN faculty AS f ON f.id = ca.faculty_id
           JOIN courses AS c ON c.id = ca.course_id
          WHERE ca.id = ?`,
        [id]
      );
      if (rows.length === 0) throw new HttpError(404, `No allocation with id ${id}`);
      const row = rows[0];

      if (row.role === "handling") {
        const [[counted]] = await conn.execute(
          `SELECT COUNT(*) AS n FROM course_allocations
            WHERE course_id = ? AND role = 'handling'`,
          [row.course_id]
        );
        if (Number(counted.n) <= 1) {
          throw new ValidationError(
            [
              {
                field: "id",
                message: `${row.faculty_name} is the last handling faculty for ${row.course_code}.`,
              },
            ],
            `Removing this would leave ${row.course_code} with no handling faculty, which hides it from everyone except an admin. Allocate the replacement first, then remove this one.`
          );
        }
      }

      await conn.execute("DELETE FROM course_allocations WHERE id = ?", [id]);
      return row;
    });

    res.json({
      removed: {
        id: removed.id,
        facultyId: removed.faculty_id,
        facultyName: removed.faculty_name,
        courseId: removed.course_id,
        courseCode: removed.course_code,
        role: removed.role,
      },
    });
  })
);

// END REMOVABLE BLOCK -- Courses and Allocations screens (server half)
// =====================================================================

// =====================================================================
// BEGIN REMOVABLE BLOCK -- Activity screen (server half)
//
//   GET /api/admin/activity - who has signed in, and who never has
//
// READ-ONLY, AND DELIBERATELY SO.
//   There is no write, no delete and no purge here, and none should be added.
//   login_events is an append-only record of who reached the portal and when;
//   a screen that could edit or clear it would make it worthless as a record
//   while still looking like one. Retention is a database decision, not a
//   button.
//
// WHAT A ZERO DOES NOT MEAN
//   Migration 018 seeded nothing. Nothing that happened before login tracking
//   was switched on is in this table, so an account in `neverSignedIn` has
//   "no sign-in RECORDED", which is not the same as "never used the portal".
//   The screen says so in as many words; this comment exists so that whoever
//   reads the endpoint next does not quietly start treating it as proof.
//
// EVERY TIMESTAMP GOES THROUGH DATE_FORMAT
//   occurred_at is DATETIME, and mysql2 turns a DATETIME into a JavaScript
//   Date built in the SERVER PROCESS's zone; JSON.stringify then writes it as
//   UTC. A 00:30 IST sign-in would arrive at the browser as the PREVIOUS day.
//   DATE_FORMAT keeps it a string the whole way: the characters the database
//   holds, unshifted and unparsed. The screen renders them as-is and never
//   builds a Date from them.
// =====================================================================

// The one timestamp format this endpoint speaks. Written once so the two
// aggregates below cannot drift apart.
const ACTIVITY_TIME = "'%Y-%m-%d %H:%i:%s'";

// ---------------------------------------------------------------------
// GET /api/admin/activity
//
// Two lists, because "who has used this" and "who has not" are different
// questions and neither is the other's complement:
//
//   signIns        one row per faculty member WITH at least one login event,
//                  active or not. An account that was deactivated after
//                  signing in still belongs in the record of who signed in --
//                  hiding it would quietly rewrite history.
//   neverSignedIn  ACTIVE accounts only. An inactive account with no events
//                  is not a person who has yet to sign in; it is a closed
//                  account, and listing it as an outstanding one would be
//                  wrong. This is the one place the two lists deliberately do
//                  not add up to the whole faculty table.
//
// last_ip is a correlated subquery rather than an aggregate: MAX(ip) would
// return the largest STRING, which is not the most recent address. Ordered by
// occurred_at then id so two events in the same second still resolve to one
// deterministic answer.
//
// The address may be NULL and often will be. The site sits behind Cloudflare,
// and the sign-in endpoint records an address only when it can show it came
// from a forwarded-client header -- see migration 018. NULL means "not known",
// never "same as the server".
// ---------------------------------------------------------------------
router.get(
  "/activity",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const [signIns] = await pool.execute(
      `SELECT f.id, f.name, f.email, f.department, f.is_active,
              COUNT(e.id) AS sign_in_count,
              DATE_FORMAT(MIN(e.occurred_at), ${ACTIVITY_TIME}) AS first_seen,
              DATE_FORMAT(MAX(e.occurred_at), ${ACTIVITY_TIME}) AS last_seen,
              (SELECT e2.ip
                 FROM login_events AS e2
                WHERE e2.faculty_id = f.id
                ORDER BY e2.occurred_at DESC, e2.id DESC
                LIMIT 1) AS last_ip
         FROM faculty AS f
         JOIN login_events AS e ON e.faculty_id = f.id
        GROUP BY f.id, f.name, f.email, f.department, f.is_active
        ORDER BY MAX(e.occurred_at) DESC`
    );

    const [neverSignedIn] = await pool.execute(
      `SELECT f.id, f.name, f.email, f.department
         FROM faculty AS f
        WHERE f.is_active = 1
          AND NOT EXISTS (SELECT 1 FROM login_events AS e WHERE e.faculty_id = f.id)
        ORDER BY f.name`
    );

    res.json({
      signIns: signIns.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        department: r.department,
        isActive: bool(r.is_active),
        signInCount: Number(r.sign_in_count),
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        lastIp: r.last_ip,
      })),
      neverSignedIn: neverSignedIn.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        department: r.department,
      })),
    });
  })
);

// END REMOVABLE BLOCK -- Activity screen (server half)
// =====================================================================


// =====================================================================
// BEGIN REMOVABLE BLOCK -- admin Course Setup screen (server half)
//
// WHAT WAS MISSING. A course created through the portal is an empty shell:
// students, assessments and CO allocations existed only inside hand-written
// migrations, so 22BT009 worked and the other 23 courses could not be used
// at all. These routes are the three pieces, admin only.
//
// WHAT IS DELIBERATELY NOT HERE
//   Course outcomes already have a write endpoint (PUT /api/courses/:id/
//   outcomes) and marks already have one (PUT /api/assessments/:id/marks).
//   Neither is touched. Nor is PUT /api/courses/:id/students, which the Name
//   List screen uses; see the note on the students routes below.
//
// THE ORDER THAT MATTERS
//   students -> enrolment -> assessment -> co_allocations -> marks.
//   PUT /api/assessments/:id/marks refuses a mark for a student who is not
//   enrolled and refuses a CO that has no allocation, so the first four steps
//   are not a convention, they are what makes the fifth possible.
// =====================================================================

const ASSESSMENT_KINDS = ["PT1", "PT2", "IP1", "IP2", "OT", "SEE"];
const SPLIT_MODES = ["manual", "lookup"];
const REG_MAX = 20;
const STUDENT_NAME_MAX = 120;

// ---------------------------------------------------------------------
// Shared lookups. Each takes a connection so it can run inside the caller's
// transaction rather than opening a second one and reading a different world.
// ---------------------------------------------------------------------

async function setupLoadCourse(conn, courseId) {
  const [rows] = await conn.execute(
    `SELECT id, code, title, co_count FROM courses WHERE id = ?`,
    [courseId]
  );
  if (rows.length === 0) throw new HttpError(404, `No course with id ${courseId}`);
  return { id: rows[0].id, code: rows[0].code, title: rows[0].title, coCount: rows[0].co_count };
}

async function setupLoadAssessment(conn, assessmentId) {
  const [rows] = await conn.execute(
    `SELECT a.id, a.course_id, a.kind, a.max_total, a.conducted_on,
            a.split_mode, a.co_split_pattern_id, c.co_count
       FROM assessments AS a
       JOIN courses     AS c ON c.id = a.course_id
      WHERE a.id = ?`,
    [assessmentId]
  );
  if (rows.length === 0) throw new HttpError(404, `No assessment with id ${assessmentId}`);
  const r = rows[0];
  return {
    id: r.id,
    courseId: r.course_id,
    kind: r.kind,
    maxTotal: num(r.max_total),
    conductedOn: r.conducted_on,
    splitMode: r.split_mode,
    coSplitPatternId: r.co_split_pattern_id,
    coCount: r.co_count,
  };
}

/**
 * How many mark rows hang off an assessment.
 *
 * This is the one question the three refusals below are all asking. A
 * student_assessments row is the mark; student_co_marks is its breakdown, and
 * is absent by design on a 'lookup' assessment, so counting only the
 * breakdown would report "no marks" for a course whose marks are all there.
 */
async function setupCountMarks(conn, assessmentId) {
  const [rows] = await conn.execute(
    `SELECT
       (SELECT COUNT(*) FROM student_assessments WHERE assessment_id = ?) AS attempts,
       (SELECT COUNT(*)
          FROM student_co_marks AS m
          JOIN student_assessments AS sa ON sa.id = m.student_assessment_id
         WHERE sa.assessment_id = ?) AS co_marks`,
    [assessmentId, assessmentId]
  );
  return { attempts: Number(rows[0].attempts), coMarks: Number(rows[0].co_marks) };
}

async function setupEnrolledStudents(conn, courseId) {
  const [rows] = await conn.execute(
    `SELECT s.id, s.reg_number, s.name, s.current_sem,
            e.id AS enrolment_id, e.academic_year, e.semester
       FROM student_enrolments AS e
       JOIN students           AS s ON s.id = e.student_id
      WHERE e.course_id = ?
      ORDER BY s.reg_number`,
    [courseId]
  );
  return rows.map((r) => ({
    id: r.id,
    regNumber: r.reg_number,
    name: r.name,
    currentSem: r.current_sem,
    enrolmentId: r.enrolment_id,
    academicYear: r.academic_year,
    semester: r.semester,
  }));
}

/**
 * Enrol, idempotently.
 *
 * academic_year and semester are NULL and sit inside the unique key, which in
 * MySQL therefore does not match on a duplicate insert -- the same reason the
 * Name List PUT reads first with <=> instead of relying on ON DUPLICATE KEY
 * UPDATE. Written the same way here so both endpoints produce the same rows.
 */
async function setupEnrol(conn, courseId, studentId) {
  const [existing] = await conn.execute(
    `SELECT id FROM student_enrolments
      WHERE student_id     =   ?
        AND course_id      =   ?
        AND academic_year <=>  NULL
        AND semester      <=>  NULL`,
    [studentId, courseId]
  );
  if (existing.length > 0) return false;
  await conn.execute(
    `INSERT INTO student_enrolments (student_id, course_id, academic_year, semester)
     VALUES (?, ?, NULL, NULL)`,
    [studentId, courseId]
  );
  return true;
}

/**
 * What a student has on this course that an un-enrolment would orphan.
 *
 * BOTH tables are checked, for the reason the Name List PUT gives: neither
 * student_assessments nor internal_marks has a foreign key to
 * student_enrolments, so removing the enrolment does not cascade. The marks
 * would stay, keep feeding the attainment tables and the risk report, and
 * appear on no roll. Checking only student_assessments would miss a course
 * whose consolidated internal mark came from elsewhere.
 */
async function setupMarkFootprint(conn, courseId, studentId) {
  const [rows] = await conn.execute(
    `SELECT
       (SELECT COUNT(*)
          FROM student_assessments AS sa
          JOIN assessments AS a ON a.id = sa.assessment_id
         WHERE a.course_id = ? AND sa.student_id = ?) AS attempts,
       (SELECT COUNT(*) FROM internal_marks
         WHERE course_id = ? AND student_id = ?) AS internal_rows`,
    [courseId, studentId, courseId, studentId]
  );
  return {
    attempts: Number(rows[0].attempts),
    internalRows: Number(rows[0].internal_rows),
  };
}

function setupMapAssessment(row, allocations, marks) {
  const allocated = allocations.reduce((sum, a) => sum + a.marksAllocated, 0);
  return {
    id: row.id,
    courseId: row.courseId,
    kind: row.kind,
    maxTotal: row.maxTotal,
    conductedOn: row.conductedOn,
    splitMode: row.splitMode,
    coSplitPatternId: row.coSplitPatternId,
    allocations,
    allocatedTotal: allocated,
    allocationsComplete: allocations.length > 0 && allocated === row.maxTotal,
    marks,
  };
}

async function setupLoadAllocations(conn, assessmentId) {
  const [rows] = await conn.execute(
    `SELECT co_number, marks_allocated
       FROM co_allocations
      WHERE assessment_id = ?
      ORDER BY co_number`,
    [assessmentId]
  );
  return rows.map((r) => ({ coNumber: r.co_number, marksAllocated: num(r.marks_allocated) }));
}

// =====================================================================
// 1. STUDENTS AND ENROLMENT
//
// WHY THESE EXIST WHEN PUT /api/courses/:id/students ALREADY DOES
//   That endpoint replaces the WHOLE roll in one call and is what the Name
//   List sheet saves. It is unchanged and still the right tool there. These
//   are per-student and admin-only: an admin adding one student, correcting
//   one spelling, or removing one enrolment should not have to send the other
//   thirty-four rows and risk deleting a roll by omission.
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/admin/courses/:id/students
// ---------------------------------------------------------------------
router.get(
  "/courses/:id/students",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const conn = await pool.getConnection();
    try {
      await setupLoadCourse(conn, courseId);
      res.json(await setupEnrolledStudents(conn, courseId));
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------
// POST /api/admin/courses/:id/students
//
// Body: { regNumber, name }
//
//   201  a student row was created, or an existing one was enrolled
//   200  that student was already on this course; nothing was written
//   400  validation, with `issues`
//   404  no such course
//
// AN EXISTING REGISTRATION NUMBER IS ENROLLED, NOT DUPLICATED, AND NOT
// RENAMED. students is institution-wide and reg_number is unique across it.
// Renaming someone from inside one course would rename them on every other
// course file too, so the name sent is ignored when the row already exists
// and the response says so.
// ---------------------------------------------------------------------
router.post(
  "/courses/:id/students",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");

    const issues = [];
    const reg = optionalString(body.regNumber, REG_MAX);
    if (!reg.ok) {
      issues.push({ field: "regNumber", message: `regNumber must be text of at most ${REG_MAX} characters` });
    } else if (reg.value === null) {
      issues.push({ field: "regNumber", message: "regNumber is required" });
    }
    const name = optionalString(body.name, STUDENT_NAME_MAX);
    if (!name.ok) {
      issues.push({ field: "name", message: `name must be text of at most ${STUDENT_NAME_MAX} characters` });
    }
    if (issues.length > 0) throw new ValidationError(issues);

    const result = await withTransaction(async (conn) => {
      await setupLoadCourse(conn, courseId);

      const [found] = await conn.execute(
        `SELECT id, name FROM students WHERE reg_number = ?`,
        [reg.value]
      );

      let studentId;
      let studentCreated = false;
      let existingName = null;

      if (found.length > 0) {
        studentId = found[0].id;
        existingName = found[0].name;
      } else {
        if (name.value === null) {
          throw new ValidationError([
            {
              field: "name",
              message: `no student with registration number ${reg.value} exists yet, so a name is required to create one`,
            },
          ]);
        }
        const [inserted] = await conn.execute(
          `INSERT INTO students (reg_number, name) VALUES (?, ?)`,
          [reg.value, name.value]
        );
        studentId = inserted.insertId;
        studentCreated = true;
      }

      const enrolled = await setupEnrol(conn, courseId, studentId);
      return { studentId, studentCreated, enrolled, existingName };
    });

    const outcome = result.studentCreated
      ? "created"
      : result.enrolled
        ? "enrolled-existing"
        : "already-enrolled";

    res.status(result.enrolled ? 201 : 200).json({
      courseId,
      studentId: result.studentId,
      regNumber: reg.value,
      outcome,
      studentCreated: result.studentCreated,
      enrolled: result.enrolled,
      // Present only when an existing row was reused, so the screen can say
      // which name is actually on file rather than the one that was typed.
      nameOnFile: result.existingName,
    });
  })
);

// ---------------------------------------------------------------------
// POST /api/admin/courses/:id/students/bulk
//
// Body: { text } -- one student per line, "regNumber,name". A tab or a
// run of spaces separates just as well; a line with no separator is a
// registration number on its own, which is enough when that student already
// exists. Blank lines are skipped.
//
// ALL OR NOTHING. Every line is parsed and resolved BEFORE anything is
// written, and the whole import runs in one transaction. One bad line means
// nothing at all is applied -- a half-imported roll is worse than no roll,
// because there is no way to tell by looking which half arrived.
//
//   200  applied. `lines` reports every line and what happened to it.
//   400  at least one line failed. `issues` names each, and NOTHING was
//        written. `lines` still reports the whole plan so the screen can show
//        which lines were fine and which were not.
// ---------------------------------------------------------------------
router.post(
  "/courses/:id/students/bulk",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");
    if (typeof body.text !== "string") {
      throw new HttpError(400, "Body must carry `text`: one student per line");
    }

    const parsed = [];
    body.text.split(/\r?\n/).forEach((raw, index) => {
      const line = raw.trim();
      if (line === "") return;
      const parts = line.split(/\s*[,\t]\s*|\s{2,}/);
      const regRaw = (parts[0] || "").trim();
      const nameRaw = parts.slice(1).join(" ").trim();
      parsed.push({ line: index + 1, text: line, regRaw, nameRaw });
    });

    if (parsed.length === 0) {
      throw new HttpError(400, "No student lines found");
    }

    const outcome = await withTransaction(async (conn) => {
      await setupLoadCourse(conn, courseId);

      const issues = [];
      const lines = [];
      const seen = new Map();

      for (const entry of parsed) {
        const record = { line: entry.line, text: entry.text, regNumber: entry.regRaw, outcome: null, message: null };
        lines.push(record);

        const reg = optionalString(entry.regRaw, REG_MAX);
        if (!reg.ok || reg.value === null) {
          record.outcome = "failed";
          record.message = `registration number must be text of 1 to ${REG_MAX} characters`;
          issues.push({ line: entry.line, message: record.message });
          continue;
        }
        if (seen.has(reg.value)) {
          record.outcome = "failed";
          record.message = `duplicate registration number, also on line ${seen.get(reg.value)}`;
          issues.push({ line: entry.line, message: record.message });
          continue;
        }
        seen.set(reg.value, entry.line);

        const name = optionalString(entry.nameRaw === "" ? null : entry.nameRaw, STUDENT_NAME_MAX);
        if (!name.ok) {
          record.outcome = "failed";
          record.message = `name must be text of at most ${STUDENT_NAME_MAX} characters`;
          issues.push({ line: entry.line, message: record.message });
          continue;
        }

        const [found] = await conn.execute(
          `SELECT id, name FROM students WHERE reg_number = ?`,
          [reg.value]
        );
        if (found.length > 0) {
          record.studentId = found[0].id;
          record.nameOnFile = found[0].name;
          record.plan = "enrol-existing";
          continue;
        }
        if (name.value === null) {
          record.outcome = "failed";
          record.message = `no student with registration number ${reg.value} exists yet, so a name is required to create one`;
          issues.push({ line: entry.line, message: record.message });
          continue;
        }
        record.name = name.value;
        record.plan = "create";
      }

      // Nothing has been written yet. This is the all-or-nothing point.
      if (issues.length > 0) {
        const err = new ValidationError(issues);
        err.lines = lines;
        throw err;
      }

      let created = 0;
      let enrolledCount = 0;
      let alreadyEnrolled = 0;

      for (const record of lines) {
        if (record.plan === "create") {
          const [inserted] = await conn.execute(
            `INSERT INTO students (reg_number, name) VALUES (?, ?)`,
            [record.regNumber, record.name]
          );
          record.studentId = inserted.insertId;
          created += 1;
        }
        const didEnrol = await setupEnrol(conn, courseId, record.studentId);
        if (didEnrol) enrolledCount += 1;
        else alreadyEnrolled += 1;
        record.outcome =
          record.plan === "create" ? "created" : didEnrol ? "enrolled-existing" : "already-enrolled";
        delete record.plan;
      }

      return { lines, created, enrolled: enrolledCount, alreadyEnrolled };
    });

    res.json({ courseId, ...outcome });
  })
);

// ---------------------------------------------------------------------
// PUT /api/admin/students/:id
//
// Body: { regNumber?, name? } -- partial; an absent field is left alone.
//
// THIS EDITS THE INSTITUTION-WIDE ROW, not a course membership, and the
// response says how many courses that touches. Correcting a misspelt name is
// exactly what it is for; it is also the one write here that reaches outside
// the course an admin is looking at.
// ---------------------------------------------------------------------
router.put(
  "/students/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const studentId = requireId(req);
    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");

    const issues = [];
    const sets = [];
    const args = [];

    if (body.regNumber !== undefined) {
      const reg = optionalString(body.regNumber, REG_MAX);
      if (!reg.ok || reg.value === null) {
        issues.push({ field: "regNumber", message: `regNumber must be text of 1 to ${REG_MAX} characters` });
      } else {
        sets.push("reg_number = ?");
        args.push(reg.value);
      }
    }
    if (body.name !== undefined) {
      const name = optionalString(body.name, STUDENT_NAME_MAX);
      if (!name.ok || name.value === null) {
        issues.push({ field: "name", message: `name must be text of 1 to ${STUDENT_NAME_MAX} characters` });
      } else {
        sets.push("name = ?");
        args.push(name.value);
      }
    }
    if (issues.length > 0) throw new ValidationError(issues);
    if (sets.length === 0) throw new HttpError(400, "Send regNumber, name, or both");

    const updated = await withTransaction(async (conn) => {
      const [found] = await conn.execute(`SELECT id FROM students WHERE id = ?`, [studentId]);
      if (found.length === 0) throw new HttpError(404, `No student with id ${studentId}`);

      try {
        await conn.execute(`UPDATE students SET ${sets.join(", ")} WHERE id = ?`, [...args, studentId]);
      } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
          throw new HttpError(409, `Another student already has that registration number`);
        }
        throw err;
      }

      const [rows] = await conn.execute(
        `SELECT id, reg_number, name, current_sem FROM students WHERE id = ?`,
        [studentId]
      );
      const [courses] = await conn.execute(
        `SELECT COUNT(DISTINCT course_id) AS n FROM student_enrolments WHERE student_id = ?`,
        [studentId]
      );
      return {
        id: rows[0].id,
        regNumber: rows[0].reg_number,
        name: rows[0].name,
        currentSem: rows[0].current_sem,
        coursesAffected: Number(courses[0].n),
      };
    });

    res.json(updated);
  })
);

// ---------------------------------------------------------------------
// DELETE /api/admin/courses/:id/students/:studentId
//
// Removes the ENROLMENT. The student row is never deleted -- they exist
// institution-wide and may be on other courses.
//
//   204  removed
//   400  that student has marks on this course. Refused, naming what exists.
//   404  no such course, or they were not enrolled on it
// ---------------------------------------------------------------------
router.delete(
  "/courses/:id/students/:studentId",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const studentId = parseId(req.params.studentId);
    if (studentId === null) throw new HttpError(400, "studentId must be a positive whole number");

    await withTransaction(async (conn) => {
      const course = await setupLoadCourse(conn, courseId);

      const [enrolment] = await conn.execute(
        `SELECT id FROM student_enrolments WHERE course_id = ? AND student_id = ?`,
        [courseId, studentId]
      );
      if (enrolment.length === 0) {
        throw new HttpError(404, `Student ${studentId} is not enrolled on ${course.code}`);
      }

      const footprint = await setupMarkFootprint(conn, courseId, studentId);
      if (footprint.attempts > 0 || footprint.internalRows > 0) {
        const parts = [];
        if (footprint.attempts > 0) {
          parts.push(`${footprint.attempts} assessment mark row${footprint.attempts === 1 ? "" : "s"}`);
        }
        if (footprint.internalRows > 0) {
          parts.push(`${footprint.internalRows} internal mark row${footprint.internalRows === 1 ? "" : "s"}`);
        }
        throw new HttpError(
          400,
          `Student ${studentId} has ${parts.join(" and ")} on ${course.code}. ` +
            `Removing the enrolment would leave those marks with no place on the roll. ` +
            `Delete the marks first if the student really did not take this course.`
        );
      }

      await conn.execute(
        `DELETE FROM student_enrolments WHERE course_id = ? AND student_id = ?`,
        [courseId, studentId]
      );
    });

    res.status(204).end();
  })
);

// =====================================================================
// 2. ASSESSMENTS
//
// There was no write endpoint for this table at all. Every assessment in the
// database today was inserted by migration 014 or 007.
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/admin/courses/:id/assessments
//
// Carries the CO allocations and the mark counts with each row, because the
// screen has to say for each assessment whether its allocations add up and
// whether it can still be edited -- both of which are this same data.
// ---------------------------------------------------------------------
router.get(
  "/courses/:id/assessments",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const conn = await pool.getConnection();
    try {
      const course = await setupLoadCourse(conn, courseId);
      const [rows] = await conn.execute(
        `SELECT id FROM assessments WHERE course_id = ? ORDER BY FIELD(kind, 'PT1','PT2','IP1','IP2','OT','SEE')`,
        [courseId]
      );
      const out = [];
      for (const r of rows) {
        const assessment = await setupLoadAssessment(conn, r.id);
        const allocations = await setupLoadAllocations(conn, r.id);
        const marks = await setupCountMarks(conn, r.id);
        out.push(setupMapAssessment(assessment, allocations, marks));
      }
      res.json({ courseId, coCount: course.coCount, assessments: out });
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------
// POST /api/admin/courses/:id/assessments
//
// Body: { kind, maxTotal, splitMode, conductedOn? }
//
//   201  created
//   400  validation, with `issues`
//   409  that course already has an assessment of that kind
//   404  no such course
//
// splitMode decides HOW A MARK IS ENTERED, which is why it is set here and
// not guessed later:
//   'manual' -- the faculty member types one mark per CO, and those marks are
//               stored in student_co_marks.
//   'lookup' -- the faculty member types a single total, and the per-CO split
//               is derived from co_split_values through a co_split_patterns
//               row whose total_max equals this assessment's maxTotal. Nothing
//               per-CO is stored, so the split cannot drift from the total.
// A 'lookup' assessment with no matching pattern would accept a total and
// then be unable to split it, so that is a 400 here rather than a surprise at
// mark entry.
// ---------------------------------------------------------------------
router.post(
  "/courses/:id/assessments",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");

    const issues = [];

    const kind = optionalString(body.kind, 10);
    if (!kind.ok || kind.value === null) {
      issues.push({ field: "kind", message: "kind is required" });
    } else if (!ASSESSMENT_KINDS.includes(kind.value)) {
      issues.push({ field: "kind", message: `kind must be one of ${ASSESSMENT_KINDS.join(", ")}` });
    }

    const maxTotal = optionalNumber(body.maxTotal);
    if (!maxTotal.ok) {
      issues.push({ field: "maxTotal", message: "maxTotal must be a number" });
    } else if (maxTotal.value === null) {
      issues.push({ field: "maxTotal", message: "maxTotal is required" });
    } else if (!(maxTotal.value > 0) || maxTotal.value > 9999) {
      issues.push({ field: "maxTotal", message: "maxTotal must be greater than 0 and at most 9999" });
    }

    const splitMode = optionalString(body.splitMode, 10);
    const splitValue = splitMode.ok && splitMode.value !== null ? splitMode.value : "manual";
    if (!splitMode.ok || !SPLIT_MODES.includes(splitValue)) {
      issues.push({ field: "splitMode", message: `splitMode must be one of ${SPLIT_MODES.join(", ")}` });
    }

    const conductedOn = optionalString(body.conductedOn, 10);
    if (!conductedOn.ok || (conductedOn.value !== null && !isDateString(conductedOn.value))) {
      issues.push({ field: "conductedOn", message: "conductedOn must be a date as YYYY-MM-DD" });
    }

    if (issues.length > 0) throw new ValidationError(issues);

    const created = await withTransaction(async (conn) => {
      const course = await setupLoadCourse(conn, courseId);

      let patternId = null;
      if (splitValue === "lookup") {
        const [patterns] = await conn.execute(
          `SELECT id, name FROM co_split_patterns WHERE total_max = ?`,
          [maxTotal.value]
        );
        if (patterns.length === 0) {
          throw new ValidationError([
            {
              field: "splitMode",
              message:
                `No CO split pattern exists for a total of ${maxTotal.value}, so a lookup assessment ` +
                `could take a total and then have no way to split it. Use manual, or add the pattern first.`,
            },
          ]);
        }
        patternId = patterns[0].id;
      }

      let insertId;
      try {
        const [result] = await conn.execute(
          `INSERT INTO assessments (course_id, kind, max_total, conducted_on, split_mode, co_split_pattern_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [courseId, kind.value, maxTotal.value, conductedOn.value, splitValue, patternId]
        );
        insertId = result.insertId;
      } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
          throw new HttpError(409, `${course.code} already has a ${kind.value} assessment`);
        }
        throw err;
      }

      const assessment = await setupLoadAssessment(conn, insertId);
      return setupMapAssessment(assessment, [], { attempts: 0, coMarks: 0 });
    });

    res.status(201).json(created);
  })
);

// ---------------------------------------------------------------------
// PUT /api/admin/assessments/:id
//
// Body: { maxTotal?, splitMode?, conductedOn? } -- partial.
//
// MAXTOTAL AND SPLITMODE ARE REFUSED ONCE MARKS EXIST, conductedOn is not.
//   maxTotal is the denominator of the internal-mark scaling in
//   internalMarks.js (PT_scaled = mark * nature.ptNMax / assessment.max_total)
//   and those scaled figures are STORED in internal_marks. Changing it under
//   existing marks would move every consolidated internal mark on the course
//   without touching a single mark sheet, and the stored rows would be stale
//   until something happened to recompute them.
//   splitMode decides whether student_co_marks rows are the truth or are
//   derived, so flipping it under existing marks reinterprets data already on
//   file.
//   conductedOn is a date on a cover sheet. It feeds nothing, so correcting it
//   after the fact is allowed and is the ordinary reason to edit at all.
// ---------------------------------------------------------------------
router.put(
  "/assessments/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const assessmentId = requireId(req);
    const body = req.body;
    if (!isPlainObject(body)) throw new HttpError(400, "Body must be a JSON object");

    const issues = [];
    let wantsMaxTotal = false;
    let wantsSplitMode = false;

    const maxTotal = optionalNumber(body.maxTotal);
    if (body.maxTotal !== undefined) {
      wantsMaxTotal = true;
      if (!maxTotal.ok || maxTotal.value === null) {
        issues.push({ field: "maxTotal", message: "maxTotal must be a number" });
      } else if (!(maxTotal.value > 0) || maxTotal.value > 9999) {
        issues.push({ field: "maxTotal", message: "maxTotal must be greater than 0 and at most 9999" });
      }
    }

    const splitMode = optionalString(body.splitMode, 10);
    if (body.splitMode !== undefined) {
      wantsSplitMode = true;
      if (!splitMode.ok || splitMode.value === null || !SPLIT_MODES.includes(splitMode.value)) {
        issues.push({ field: "splitMode", message: `splitMode must be one of ${SPLIT_MODES.join(", ")}` });
      }
    }

    const conductedOn = optionalString(body.conductedOn, 10);
    if (body.conductedOn !== undefined) {
      if (!conductedOn.ok || (conductedOn.value !== null && !isDateString(conductedOn.value))) {
        issues.push({ field: "conductedOn", message: "conductedOn must be a date as YYYY-MM-DD, or null" });
      }
    }

    if (body.kind !== undefined) {
      issues.push({
        field: "kind",
        message:
          "kind cannot be changed. It is the natural key of the assessment and names it on every mark sheet; " +
          "delete and recreate instead, which is refused once marks exist and so cannot happen silently.",
      });
    }

    if (issues.length > 0) throw new ValidationError(issues);
    if (!wantsMaxTotal && !wantsSplitMode && body.conductedOn === undefined) {
      throw new HttpError(400, "Send maxTotal, splitMode or conductedOn");
    }

    const updated = await withTransaction(async (conn) => {
      const assessment = await setupLoadAssessment(conn, assessmentId);
      const marks = await setupCountMarks(conn, assessmentId);

      if ((wantsMaxTotal || wantsSplitMode) && marks.attempts > 0) {
        const fields = [wantsMaxTotal ? "maxTotal" : null, wantsSplitMode ? "splitMode" : null]
          .filter(Boolean)
          .join(" and ");
        throw new HttpError(
          400,
          `${assessment.kind} already has ${marks.attempts} mark row${marks.attempts === 1 ? "" : "s"}. ` +
            `${fields} cannot be changed while marks exist: every internal mark on this course is scaled by ` +
            `maxTotal, and splitMode decides whether the stored per-CO marks are the truth or are derived. ` +
            `Delete the marks first, or correct conductedOn on its own.`
        );
      }

      const sets = [];
      const args = [];
      if (wantsMaxTotal) {
        sets.push("max_total = ?");
        args.push(maxTotal.value);
      }
      if (wantsSplitMode) {
        sets.push("split_mode = ?");
        args.push(splitMode.value);
        let patternId = null;
        if (splitMode.value === "lookup") {
          const target = wantsMaxTotal ? maxTotal.value : assessment.maxTotal;
          const [patterns] = await conn.execute(
            `SELECT id FROM co_split_patterns WHERE total_max = ?`,
            [target]
          );
          if (patterns.length === 0) {
            throw new ValidationError([
              {
                field: "splitMode",
                message: `No CO split pattern exists for a total of ${target}`,
              },
            ]);
          }
          patternId = patterns[0].id;
        }
        sets.push("co_split_pattern_id = ?");
        args.push(patternId);
      }
      if (body.conductedOn !== undefined) {
        sets.push("conducted_on = ?");
        args.push(conductedOn.value);
      }

      await conn.execute(`UPDATE assessments SET ${sets.join(", ")} WHERE id = ?`, [...args, assessmentId]);

      const after = await setupLoadAssessment(conn, assessmentId);
      const allocations = await setupLoadAllocations(conn, assessmentId);
      return setupMapAssessment(after, allocations, await setupCountMarks(conn, assessmentId));
    });

    res.json(updated);
  })
);

// ---------------------------------------------------------------------
// DELETE /api/admin/assessments/:id
//
//   204  deleted, with its CO allocations, which cascade
//   400  marks exist. Refused, naming how many.
//   404  no such assessment
//
// co_allocations cascades on the foreign key, so deleting an assessment with
// no marks takes its allocations with it and leaves nothing orphaned.
// ---------------------------------------------------------------------
router.delete(
  "/assessments/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const assessmentId = requireId(req);

    await withTransaction(async (conn) => {
      const assessment = await setupLoadAssessment(conn, assessmentId);
      const marks = await setupCountMarks(conn, assessmentId);
      if (marks.attempts > 0) {
        throw new HttpError(
          400,
          `${assessment.kind} has ${marks.attempts} mark row${marks.attempts === 1 ? "" : "s"} ` +
            `and ${marks.coMarks} per-CO row${marks.coMarks === 1 ? "" : "s"}. ` +
            `Deleting the assessment would delete all of them. Delete the marks first if that is really intended.`
        );
      }
      await conn.execute(`DELETE FROM assessments WHERE id = ?`, [assessmentId]);
    });

    res.status(204).end();
  })
);

// =====================================================================
// 3. CO ALLOCATIONS
//
// The mark budget of an assessment, per CO. The sum across COs is expected to
// equal the assessment's maxTotal; migration 005 says out loud that this is an
// application rule and not a database constraint, because a course file is
// routinely saved half-entered. These two routes are where that rule is
// actually enforced for the first time.
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/admin/assessments/:id/co-allocations
// ---------------------------------------------------------------------
router.get(
  "/assessments/:id/co-allocations",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const assessmentId = requireId(req);
    const conn = await pool.getConnection();
    try {
      const assessment = await setupLoadAssessment(conn, assessmentId);
      const allocations = await setupLoadAllocations(conn, assessmentId);
      const marks = await setupCountMarks(conn, assessmentId);
      res.json({
        assessmentId,
        courseId: assessment.courseId,
        kind: assessment.kind,
        maxTotal: assessment.maxTotal,
        coCount: assessment.coCount,
        allocations,
        allocatedTotal: allocations.reduce((s, a) => s + a.marksAllocated, 0),
        marks,
        editable: marks.attempts === 0,
      });
    } finally {
      conn.release();
    }
  })
);

// ---------------------------------------------------------------------
// PUT /api/admin/assessments/:id/co-allocations
//
// Body: [{ coNumber, marksAllocated }] -- the WHOLE set, replacing what is
// there, in one transaction.
//
//   200  replaced
//   400  refused. Three reasons, each naming its numbers:
//        - marks already exist for this assessment
//        - a coNumber is not a CO this course has
//        - the allocations do not sum to the assessment maximum
//   404  no such assessment
//
// THE SUM RULE IS THE POINT.
//   Every CO percentage on every printed sheet is marks_obtained divided by
//   marks_allocated. If the parts do not add up to the total the student was
//   marked out of, each CO percentage is still arithmetically valid and the
//   course file as a whole is wrong -- which is exactly the defect class this
//   portal exists to catch. So it is refused, with both numbers in the
//   sentence rather than a bare "invalid".
//
// AND SO IS THE REFUSAL ONCE MARKS EXIST.
//   Nothing stores an attainment figure: every one is recomputed from
//   marks_obtained over marks_allocated whenever a sheet is drawn. Changing an
//   allocation under existing marks therefore does not corrupt a stored
//   number -- it silently moves every attainment figure, level and remedial
//   list already published for that assessment, with no record that anything
//   happened. That is refused here. See section 3 of the report for what a
//   safe re-allocation would need.
// ---------------------------------------------------------------------
router.put(
  "/assessments/:id/co-allocations",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const assessmentId = requireId(req);
    const body = req.body;
    if (!Array.isArray(body)) {
      throw new HttpError(400, "Body must be an array of { coNumber, marksAllocated }");
    }

    const result = await withTransaction(async (conn) => {
      const assessment = await setupLoadAssessment(conn, assessmentId);
      const marks = await setupCountMarks(conn, assessmentId);

      if (marks.attempts > 0) {
        throw new HttpError(
          400,
          `${assessment.kind} already has ${marks.attempts} mark row${marks.attempts === 1 ? "" : "s"} ` +
            `and ${marks.coMarks} per-CO row${marks.coMarks === 1 ? "" : "s"}. ` +
            `CO allocations are the denominator of every attainment figure for this assessment, so changing ` +
            `them now would move every published percentage, level and remedial list without any record of it. ` +
            `Delete the marks first if the allocation really was wrong.`
        );
      }

      const issues = [];
      const seen = new Set();
      const rows = [];
      let sum = 0;

      body.forEach((row, index) => {
        if (!isPlainObject(row)) {
          issues.push({ index, message: "entry must be an object" });
          return;
        }
        const co = optionalNumber(row.coNumber);
        if (!co.ok || co.value === null || !Number.isInteger(co.value)) {
          issues.push({ index, message: "coNumber must be a whole number" });
          return;
        }
        if (co.value < 1 || co.value > assessment.coCount) {
          issues.push({
            index,
            coNumber: co.value,
            message: `CO${co.value} is not a CO of this course, which has ${assessment.coCount}`,
          });
          return;
        }
        if (seen.has(co.value)) {
          issues.push({ index, coNumber: co.value, message: `CO${co.value} appears more than once` });
          return;
        }
        seen.add(co.value);

        const marksAllocated = optionalNumber(row.marksAllocated);
        if (!marksAllocated.ok || marksAllocated.value === null) {
          issues.push({ index, coNumber: co.value, message: "marksAllocated must be a number" });
          return;
        }
        if (marksAllocated.value < 0 || marksAllocated.value > 9999) {
          issues.push({ index, coNumber: co.value, message: "marksAllocated must be between 0 and 9999" });
          return;
        }
        sum += marksAllocated.value;
        rows.push({ coNumber: co.value, marksAllocated: marksAllocated.value });
      });

      if (issues.length > 0) throw new ValidationError(issues);

      // Two decimals is what the column stores; comparing the raw floats would
      // fail on 16.66 + 16.67 + 16.67.
      const rounded = Math.round(sum * 100) / 100;
      if (rounded !== assessment.maxTotal) {
        throw new HttpError(
          400,
          `The CO allocations add up to ${rounded}, but ${assessment.kind} is out of ${assessment.maxTotal}. ` +
            `Every CO percentage on the printed file is marks obtained over marks allocated, so a course file ` +
            `whose parts do not add up to its total is wrong even though each figure looks right.`
        );
      }

      await conn.execute(`DELETE FROM co_allocations WHERE assessment_id = ?`, [assessmentId]);
      for (const row of rows) {
        await conn.execute(
          `INSERT INTO co_allocations (assessment_id, co_number, marks_allocated) VALUES (?, ?, ?)`,
          [assessmentId, row.coNumber, row.marksAllocated]
        );
      }

      const after = await setupLoadAllocations(conn, assessmentId);
      return setupMapAssessment(assessment, after, await setupCountMarks(conn, assessmentId));
    });

    res.json(result);
  })
);

// END REMOVABLE BLOCK -- admin Course Setup screen (server half)
// =====================================================================

module.exports = router;

// END REMOVABLE BLOCK -- admin Users screen (server half)
