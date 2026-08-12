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
// Institution-wide reference data: none of it belongs to a single course.
// Read-only. Every query is parameterised.
// ---------------------------------------------------------------

const express = require("express");
const pool = require("../db");
const { asyncHandler, HttpError, num } = require("../helpers");

const router = express.Router();

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

module.exports = router;
