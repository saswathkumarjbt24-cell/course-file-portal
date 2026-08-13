// ---------------------------------------------------------------
// Routes mounted at /api/reference
//
//   GET /api/reference/program-outcomes      - POs + PSOs
//   GET /api/reference/co-split/:patternName - a split pattern and its lookup
//   GET /api/reference/institution           - the institution block
//   GET /api/reference/attainment-constants  - the attainment weights
//   GET /api/reference/attainment-bands      - percentage -> level bands
//   GET /api/reference/course-natures        - the mark scales
//   GET /api/reference/vision-missions       - vision + ordered missions
//   GET /api/reference/peos                  - programme educational objectives
//
//   PUT /api/reference/vision-mission        - one scope's vision + missions
//   PUT /api/reference/peos                  - one department's PEO list
//   PUT /api/reference/psos                  - one department's PSO list
//
// Institution-wide reference data: none of it belongs to a single course.
// Every query is parameterised; writes run through withTransaction.
//
// PROGRAMME OUTCOMES ARE DELIBERATELY NOT WRITEABLE
//   PO1..PO12 are the NBA's own text, identical for every programme in the
//   country. There is nothing here for an institution to edit, and an
//   endpoint that allowed it would let one course file quietly diverge from
//   the standard the accreditation is measured against.
//
// WHY THESE UPSERTS USE <=> AND NOT ON DUPLICATE KEY UPDATE
//   vision_missions is keyed UNIQUE(scope, department) and peos UNIQUE(
//   department, code), and in BOTH cases `department` is NULLable and holds
//   NULL for the rows that actually exist -- the institution vision, and PEOs
//   that apply to every department. In MySQL a UNIQUE key does not match when
//   one of its columns is NULL, so ON DUPLICATE KEY UPDATE would never fire
//   and every save would insert a duplicate row. The existence check is
//   therefore explicit and uses the NULL-safe <=>, exactly as the attendance
//   and student_enrolments writes do.
//
//   program_specific_outcomes.department is NOT NULL, so its key does match
//   and it is the one table here that can use a plain upsert.
// ---------------------------------------------------------------

const express = require("express");
const pool = require("../db");
const {
  asyncHandler,
  HttpError,
  ValidationError,
  withTransaction,
  num,
  isPlainObject,
  optionalString,
} = require("../helpers");

const router = express.Router();

const VISION_SCOPES = ["institution", "department"];

// TEXT holds 65535 BYTES and utf8mb4 spends up to four per character, so the
// cap sits well under that: an over-long statement is a 400 naming the row,
// never a value silently cut in half on its way into the column.
const STATEMENT_MAX = 10000;

// ---------------------------------------------------------------------
// GET /api/reference/program-outcomes
//
// Both vocabularies together, because the articulation matrix needs them
// side by side to resolve an outcome_code. Ordered by the NUMBER inside the
// code so PO2 comes before PO12.
// ---------------------------------------------------------------------
router.get(
  "/program-outcomes",
  asyncHandler(async (req, res) => {
    const [pos] = await pool.execute(
      `SELECT id, code, title, statement
         FROM program_outcomes
        ORDER BY CAST(REGEXP_SUBSTR(code, '[0-9]+') AS UNSIGNED)`
    );

    const [psos] = await pool.execute(
      `SELECT id, department, code, statement
         FROM program_specific_outcomes
        ORDER BY department,
                 CAST(REGEXP_SUBSTR(code, '[0-9]+') AS UNSIGNED)`
    );

    res.json({
      programOutcomes: pos.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        statement: r.statement,
      })),
      programSpecificOutcomes: psos.map((r) => ({
        id: r.id,
        department: r.department,
        code: r.code,
        statement: r.statement,
      })),
    });
  })
);

// ---------------------------------------------------------------------
// GET /api/reference/co-split/:patternName
//
// Looked up by NAME, e.g. "PT 50 (20/20/10)". The name contains slashes, so
// the client must percent-encode it; Express matches on the still-encoded
// path and decodes the param afterwards, so the slashes do not split the
// route.
//
// The values are the hand-authored lookup from the source workbook. They
// follow no formula and are returned exactly as stored, ordered by total_mark
// so the client can index straight into them.
// ---------------------------------------------------------------------
router.get(
  "/co-split/:patternName",
  asyncHandler(async (req, res) => {
    const patternName = req.params.patternName;

    const [patterns] = await pool.execute(
      `SELECT id, name, total_max, q1_max, q2_max, q3_max, notes
         FROM co_split_patterns
        WHERE name = ?`,
      [patternName]
    );
    if (patterns.length === 0) {
      throw new HttpError(404, `No CO split pattern named "${patternName}"`);
    }
    const pattern = patterns[0];

    const [values] = await pool.execute(
      `SELECT id, pattern_id, total_mark, q1, q2, q3
         FROM co_split_values
        WHERE pattern_id = ?
        ORDER BY total_mark`,
      [pattern.id]
    );

    res.json({
      pattern: {
        id: pattern.id,
        name: pattern.name,
        totalMax: pattern.total_max,
        q1Max: pattern.q1_max,
        q2Max: pattern.q2_max,
        q3Max: pattern.q3_max,
        notes: pattern.notes,
      },
      values: values.map((r) => ({
        id: r.id,
        patternId: r.pattern_id,
        totalMark: r.total_mark,
        q1: r.q1,
        q2: r.q2,
        q3: r.q3,
      })),
    });
  })
);

// ---------------------------------------------------------------------
// GET /api/reference/institution
//
// The settings rows of scope 'institution', returned as one object keyed by
// key_name -- the shape the printed sheets expect.
// ---------------------------------------------------------------------
router.get(
  "/institution",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT key_name, value FROM settings WHERE scope = 'institution'`
    );
    const out = {};
    for (const r of rows) out[r.key_name] = r.value;
    res.json(out);
  })
);

// ---------------------------------------------------------------------
// GET /api/reference/attainment-constants
//
// settings stores every value as TEXT, so the weights are cast to numbers
// here -- the frontend multiplies by them and must never do arithmetic on a
// string.
//
// NOTE: cieWeight 0.4 / seeWeight 0.6 follow the FORMULA in the source
// spreadsheet, not its label text, which reads 0.5 / 0.5. That conflict is
// unresolved and inherited from the fixtures.
// ---------------------------------------------------------------------
router.get(
  "/attainment-constants",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT key_name, value FROM settings WHERE scope = 'attainment'`
    );
    const out = {};
    for (const r of rows) out[r.key_name] = num(r.value);
    res.json(out);
  })
);

// ---------------------------------------------------------------------
// GET /api/reference/attainment-bands
//
// Ordered highest threshold first, which is the order the band lookup walks.
// ---------------------------------------------------------------------
router.get(
  "/attainment-bands",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, min_percent, level
         FROM attainment_bands
        ORDER BY min_percent DESC`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        minPercent: num(r.min_percent),
        level: r.level,
      }))
    );
  })
);

// ---------------------------------------------------------------------
// GET /api/reference/course-natures
// ---------------------------------------------------------------------
router.get(
  "/course-natures",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, name, pt1_max, pt2_max, ip_max, int_total, see_total,
              low_im_threshold, notes
         FROM course_natures
        ORDER BY id`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        pt1Max: num(r.pt1_max),
        pt2Max: num(r.pt2_max),
        ipMax: num(r.ip_max),
        intTotal: num(r.int_total),
        seeTotal: num(r.see_total),
        lowImThreshold: num(r.low_im_threshold),
        notes: r.notes,
      }))
    );
  })
);

// ---------------------------------------------------------------------
// GET /api/reference/vision-missions
//
// The institution entry and each department entry, every one carrying its
// missions in printed order. `seq` is the order, not row order.
// ---------------------------------------------------------------------
router.get(
  "/vision-missions",
  asyncHandler(async (req, res) => {
    const [visions] = await pool.execute(
      `SELECT id, scope, department, vision
         FROM vision_missions
        ORDER BY scope, department`
    );
    const [missions] = await pool.execute(
      `SELECT vision_mission_id, seq, statement
         FROM missions
        ORDER BY vision_mission_id, seq`
    );

    const byParent = new Map();
    for (const m of missions) {
      if (!byParent.has(m.vision_mission_id)) byParent.set(m.vision_mission_id, []);
      byParent.get(m.vision_mission_id).push(m.statement);
    }

    res.json(
      visions.map((v) => ({
        id: v.id,
        scope: v.scope,
        department: v.department,
        vision: v.vision,
        missions: byParent.get(v.id) || [],
      }))
    );
  })
);

// ---------------------------------------------------------------------
// GET /api/reference/peos
//
// department is NULL for a PEO that applies to every department, which is how
// the sample data records them.
// ---------------------------------------------------------------------
router.get(
  "/peos",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, department, code, statement
         FROM peos
        ORDER BY CAST(REGEXP_SUBSTR(code, '[0-9]+') AS UNSIGNED)`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        department: r.department,
        code: r.code,
        statement: r.statement,
      }))
    );
  })
);

// =====================================================================
// WRITES
// =====================================================================

// ---------------------------------------------------------------------
// PUT /api/reference/vision-mission
//
// Body: { scope, department, vision, missions: [statement, ...] }
//
// One scope at a time -- 'institution', or one named department. `missions`
// is an ordered array of plain strings, matching what the GET returns, and
// its POSITION is the M-number: the first entry is M1. Nothing carries an id,
// so reordering the array reorders the printed list.
//
// department is IGNORED for scope 'institution' and forced to NULL. The
// institution has exactly one vision and it belongs to no department; storing
// one against a department would create a second institution row that the GET
// would then have to choose between.
//
// MISSIONS ARE UPSERTED BY POSITION AND THEN TRIMMED
//   Rows 1..n are written by seq, then any row with a HIGHER seq is deleted.
//   Sending four missions where five were stored therefore drops the fifth,
//   which is what editing a list to four entries means. Rewriting in place
//   rather than deleting everything first keeps the ids of rows that did not
//   change.
// ---------------------------------------------------------------------
router.put(
  "/vision-mission",
  asyncHandler(async (req, res) => {
    const body = req.body;

    if (!isPlainObject(body)) {
      throw new HttpError(400, "Body must be an object");
    }

    const missionsIn = body.missions === undefined ? [] : body.missions;
    if (!Array.isArray(missionsIn)) {
      throw new HttpError(400, "missions must be an array of statements");
    }

    const result = await withTransaction(async (conn) => {
      const issues = [];

      const scope = body.scope;
      if (!VISION_SCOPES.includes(scope)) {
        issues.push({
          field: "scope",
          value: body.scope,
          message: `scope must be one of ${VISION_SCOPES.join(", ")}`,
        });
      }

      // NULL for the institution, required for a department.
      let department = null;
      if (scope === "department") {
        const parsed = optionalString(body.department, 100);
        if (!parsed.ok || parsed.value === null) {
          issues.push({
            field: "department",
            value: body.department,
            message:
              "department must be a non-empty string of 100 characters or fewer for scope 'department'",
          });
        } else {
          department = parsed.value;
        }
      }

      const vision = optionalString(body.vision, STATEMENT_MAX);
      if (!vision.ok || vision.value === null) {
        issues.push({
          field: "vision",
          message: `vision must be a non-empty string of ${STATEMENT_MAX} characters or fewer`,
        });
      }

      const missions = [];
      missionsIn.forEach((raw, index) => {
        const parsed = optionalString(raw, STATEMENT_MAX);
        if (!parsed.ok || parsed.value === null) {
          issues.push({
            list: "missions",
            index,
            message: `mission M${index + 1} must be a non-empty string of ${STATEMENT_MAX} characters or fewer`,
          });
          return;
        }
        missions.push(parsed.value);
      });

      if (issues.length > 0) throw new ValidationError(issues);

      // NULL-safe lookup: `department <=> ?` matches the NULL institution row,
      // which `department = ?` never would.
      const [existing] = await conn.execute(
        `SELECT id FROM vision_missions WHERE scope = ? AND department <=> ?`,
        [scope, department]
      );

      let visionMissionId;
      if (existing.length > 0) {
        visionMissionId = existing[0].id;
        await conn.execute(`UPDATE vision_missions SET vision = ? WHERE id = ?`, [
          vision.value,
          visionMissionId,
        ]);
      } else {
        const [inserted] = await conn.execute(
          `INSERT INTO vision_missions (scope, department, vision) VALUES (?, ?, ?)`,
          [scope, department, vision.value]
        );
        visionMissionId = inserted.insertId;
      }

      // Both columns of uq_missions_parent_seq are NOT NULL, so the key
      // matches and a plain upsert is correct here.
      for (let i = 0; i < missions.length; i += 1) {
        await conn.execute(
          `INSERT INTO missions (vision_mission_id, seq, statement)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE statement = ?`,
          [visionMissionId, i + 1, missions[i], missions[i]]
        );
      }

      const [trimmed] = await conn.execute(
        `DELETE FROM missions WHERE vision_mission_id = ? AND seq > ?`,
        [visionMissionId, missions.length]
      );

      return {
        id: visionMissionId,
        scope,
        department,
        missionsSaved: missions.length,
        missionsRemoved: trimmed.affectedRows,
      };
    });

    res.json(result);
  })
);

// ---------------------------------------------------------------------
// PUT /api/reference/peos
//
// Body: { department, peos: [{ code, statement }] }
//
// department is OPTIONAL and null means "applies to every department", which
// is how the seeded PEOs are recorded. It is part of the unique key, so a
// null there is exactly the case the <=> lookup below exists for.
//
// `code` may be omitted, in which case it is PEO1, PEO2, ... by position. The
// GET orders by the number inside the code, so position and code have to
// agree or the printed list reorders itself.
//
// UPSERT AND PRUNE
//   Codes in the body are written; codes stored for this department that the
//   body does not mention are deleted, because editing the list down to two
//   entries is how a PEO is removed. Scoped to the one department: a PEO
//   belonging to another department is never touched.
// ---------------------------------------------------------------------
router.put(
  "/peos",
  asyncHandler(async (req, res) => {
    const body = req.body;

    if (!isPlainObject(body)) {
      throw new HttpError(400, "Body must be an object");
    }
    const peosIn = body.peos === undefined ? [] : body.peos;
    if (!Array.isArray(peosIn)) {
      throw new HttpError(400, "peos must be an array of { code, statement }");
    }

    const result = await withTransaction(async (conn) => {
      const issues = [];

      const departmentParsed = optionalString(body.department, 100);
      if (!departmentParsed.ok) {
        issues.push({
          field: "department",
          value: body.department,
          message: "department must be a string of 100 characters or fewer, or null",
        });
      }
      const department = departmentParsed.value;

      const rows = [];
      const seen = new Set();

      peosIn.forEach((row, index) => {
        const fail = (message, extra = {}) => issues.push({ index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const codeParsed = optionalString(row.code, 10);
        if (!codeParsed.ok) {
          return fail("code must be a string of 10 characters or fewer", { code: row.code });
        }
        const code = codeParsed.value === null ? `PEO${index + 1}` : codeParsed.value;
        if (seen.has(code)) return fail("duplicate code", { code });
        seen.add(code);

        const statement = optionalString(row.statement, STATEMENT_MAX);
        if (!statement.ok || statement.value === null) {
          return fail(
            `statement must be a non-empty string of ${STATEMENT_MAX} characters or fewer`,
            { code }
          );
        }

        rows.push({ code, statement: statement.value });
      });

      if (issues.length > 0) throw new ValidationError(issues);

      for (const r of rows) {
        const [existing] = await conn.execute(
          `SELECT id FROM peos WHERE department <=> ? AND code = ?`,
          [department, r.code]
        );
        if (existing.length > 0) {
          await conn.execute(`UPDATE peos SET statement = ? WHERE id = ?`, [
            r.statement,
            existing[0].id,
          ]);
        } else {
          await conn.execute(
            `INSERT INTO peos (department, code, statement) VALUES (?, ?, ?)`,
            [department, r.code, r.statement]
          );
        }
      }

      // Prune whatever this department no longer lists. Built as one
      // placeholder per code rather than an interpolated list, so the codes
      // stay parameters.
      let removed = 0;
      if (rows.length === 0) {
        const [deleted] = await conn.execute(
          `DELETE FROM peos WHERE department <=> ?`,
          [department]
        );
        removed = deleted.affectedRows;
      } else {
        const placeholders = rows.map(() => "?").join(", ");
        const [deleted] = await conn.execute(
          `DELETE FROM peos WHERE department <=> ? AND code NOT IN (${placeholders})`,
          [department, ...rows.map((r) => r.code)]
        );
        removed = deleted.affectedRows;
      }

      return { department, saved: rows.length, removed };
    });

    res.json(result);
  })
);

// ---------------------------------------------------------------------
// PUT /api/reference/psos
//
// Body: { department, psos: [{ code, statement }] }
//
// department is REQUIRED -- program_specific_outcomes.department is NOT NULL,
// and a PSO with no department is meaningless: "programme specific" is the
// whole point of the vocabulary.
//
// Because both key columns are NOT NULL the unique key really does match, so
// this is the one write in this file that can use ON DUPLICATE KEY UPDATE.
//
// A PSO STILL USED BY AN ARTICULATION MATRIX CANNOT BE REMOVED
//   co_po_matrix stores its columns by CODE ('PSO2') with no foreign key to
//   this table. Dropping a code some course still maps a CO to would leave
//   those cells pointing at nothing: they would keep their stored strengths,
//   vanish from the printed matrix because the column no longer exists, and
//   quietly stop contributing to PO/PSO attainment. So a removal that would
//   do that is a 400 naming the code and the courses, and the whole save is
//   rolled back. Renaming a code is a remove plus an add here, so it is
//   caught by the same check.
//
//   Scoped to courses of the SAME department, since that is the only place
//   this department's PSO codes can legitimately be referenced from.
// ---------------------------------------------------------------------
router.put(
  "/psos",
  asyncHandler(async (req, res) => {
    const body = req.body;

    if (!isPlainObject(body)) {
      throw new HttpError(400, "Body must be an object");
    }
    const psosIn = body.psos === undefined ? [] : body.psos;
    if (!Array.isArray(psosIn)) {
      throw new HttpError(400, "psos must be an array of { code, statement }");
    }

    const result = await withTransaction(async (conn) => {
      const issues = [];

      const departmentParsed = optionalString(body.department, 100);
      if (!departmentParsed.ok || departmentParsed.value === null) {
        issues.push({
          field: "department",
          value: body.department,
          message: "department must be a non-empty string of 100 characters or fewer",
        });
      }
      const department = departmentParsed.value;

      const rows = [];
      const seen = new Set();

      psosIn.forEach((row, index) => {
        const fail = (message, extra = {}) => issues.push({ index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const codeParsed = optionalString(row.code, 10);
        if (!codeParsed.ok) {
          return fail("code must be a string of 10 characters or fewer", { code: row.code });
        }
        const code = codeParsed.value === null ? `PSO${index + 1}` : codeParsed.value;
        if (seen.has(code)) return fail("duplicate code", { code });
        seen.add(code);

        const statement = optionalString(row.statement, STATEMENT_MAX);
        if (!statement.ok || statement.value === null) {
          return fail(
            `statement must be a non-empty string of ${STATEMENT_MAX} characters or fewer`,
            { code }
          );
        }

        rows.push({ code, statement: statement.value });
      });

      if (issues.length > 0) throw new ValidationError(issues);

      // Which stored codes this save would drop, and whether any matrix still
      // points at them. Checked BEFORE a single row is written.
      const [stored] = await conn.execute(
        `SELECT code FROM program_specific_outcomes WHERE department = ?`,
        [department]
      );
      const keeping = new Set(rows.map((r) => r.code));
      const dropping = stored.map((r) => r.code).filter((code) => !keeping.has(code));

      for (const code of dropping) {
        const [used] = await conn.execute(
          `SELECT c.code AS course_code
             FROM co_po_matrix AS m
             JOIN courses      AS c ON c.id = m.course_id
            WHERE m.outcome_type = 'PSO'
              AND m.outcome_code = ?
              AND c.department   = ?
            GROUP BY c.code
            ORDER BY c.code`,
          [code, department]
        );
        if (used.length === 0) continue;

        issues.push({
          outcomeCode: code,
          message:
            `${code} is still mapped in the articulation matrix of ${used
              .map((u) => u.course_code)
              .join(", ")}. Removing it would leave those cells pointing at an ` +
            `outcome that no longer exists, so nothing was saved. Clear the matrix ` +
            `cells on the Course Setup screen first.`,
        });
      }

      if (issues.length > 0) throw new ValidationError(issues);

      for (const r of rows) {
        await conn.execute(
          `INSERT INTO program_specific_outcomes (department, code, statement)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE statement = ?`,
          [department, r.code, r.statement, r.statement]
        );
      }

      let removed = 0;
      for (const code of dropping) {
        const [deleted] = await conn.execute(
          `DELETE FROM program_specific_outcomes WHERE department = ? AND code = ?`,
          [department, code]
        );
        removed += deleted.affectedRows;
      }

      return { department, saved: rows.length, removed };
    });

    res.json(result);
  })
);

module.exports = router;
