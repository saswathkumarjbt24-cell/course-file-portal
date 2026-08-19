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

module.exports = router;

// END REMOVABLE BLOCK -- admin Users screen (server half)
