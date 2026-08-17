// ---------------------------------------------------------------
// Routes mounted at /api/reports
//
//   GET /api/reports/internal-marks - every internal_marks row, joined to the
//                                     student, the course and the course
//                                     nature
//
// Read-only, and scoped to the courses the caller may see. The only value
// reaching the query is the caller's own department or faculty id, taken from
// the signed session token and bound as a parameter -- never anything a
// request asked for.
// ---------------------------------------------------------------

const express = require("express");
const pool = require("../db");
const { asyncHandler, num } = require("../helpers");
const { courseScope } = require("../auth");
const { loadMarkContext } = require("../internalMarks");

const router = express.Router();

// ---------------------------------------------------------------------
// GET /api/reports/internal-marks
//
// The input to the institution-wide risk report. The course nature is joined
// in so each row carries its own lowImThreshold: the threshold is per nature
// (Theory 23, Theory & Lab 27.5, Mini Project I 32) and the report must not
// hardcode it.
//
// Returns every course the CALLER MAY SEE, not one, because the report ranks
// across all of them. A course with no internal_marks rows simply contributes
// none.
//
// SCOPED THE SAME WAY THE COURSE LIST IS
//   A faculty member's risk report covers their allocated courses, a hod's
//   their department, an admin's the institution. Rows outside that are
//   filtered out rather than refused, for the same reason GET /api/courses
//   filters: the report is a whole-institution ranking by construction, and
//   403-ing it would leave the screen blank instead of showing the caller
//   their own students. The counts and rankings the screen prints are
//   therefore over what the caller may see, which is the only honest total
//   it could show them.
//
// pt1 / pt2 / ip are null for a nature with no component breakdown -- Mini
// Project I records a total and nothing else. That is real, not missing data.
//
// STORED TOTAL, DERIVED STATES
//   `total`, `pt1`, `pt2` and `ip` are read straight from internal_marks --
//   the stored figures, which are what the record says.
//
//   `components`, `otValue`, `computedTotal` and `substituted` are DERIVED
//   here, on the fly, from the assessment rows. They are not stored anywhere:
//   internal_marks has no column for "which component was substituted", and
//   the printed mark sheet cannot draw its "(OT)" marker or say "Absent"
//   without them. Deriving beats adding columns, because the rule already
//   exists in one place (internalMarks.js) and this keeps it there.
//
//   `totalMismatch` is true only when BOTH totals exist and differ. A course
//   with no assessments entered has computedTotal null -- nothing to compare,
//   so it is not a mismatch. When it IS true the stored total is still what
//   the record says; the flag exists so the disagreement is visible rather
//   than silently resolved.
// ---------------------------------------------------------------------
router.get(
  "/internal-marks",
  asyncHandler(async (req, res) => {
    const scope = courseScope(req.faculty, "c");
    const [rows] = await pool.execute(
      `SELECT im.student_id,
              im.course_id,
              im.pt1,
              im.pt2,
              im.ip,
              im.total,
              s.reg_number,
              s.name         AS student_name,
              c.code         AS course_code,
              c.title        AS course_title,
              c.department,
              c.nature_id,
              n.name         AS nature_name,
              n.pt1_max,
              n.pt2_max,
              n.ip_max,
              n.int_total,
              n.low_im_threshold
         FROM internal_marks AS im
         JOIN students       AS s ON s.id = im.student_id
         JOIN courses        AS c ON c.id = im.course_id
         JOIN course_natures AS n ON n.id = c.nature_id
        WHERE ${scope.sql}
        ORDER BY c.code, s.reg_number`,
      scope.params
    );

    // One pass over the assessment tables, reused for every row.
    const context = await loadMarkContext(pool);

    res.json(
      rows.map((r) => {
        const computed = context.compute(r.course_id, r.student_id);
        const storedTotal = num(r.total);
        return {
        studentId: r.student_id,
        courseId: r.course_id,
        regNumber: r.reg_number,
        studentName: r.student_name,
        courseCode: r.course_code,
        courseTitle: r.course_title,
        department: r.department,
        natureId: r.nature_id,
        natureName: r.nature_name,
        pt1: num(r.pt1),
        pt2: num(r.pt2),
        ip: num(r.ip),
        total: num(r.total),
        pt1Max: num(r.pt1_max),
        pt2Max: num(r.pt2_max),
        ipMax: num(r.ip_max),
        intTotal: num(r.int_total),
        lowImThreshold: num(r.low_im_threshold),

        // --- derived, not stored ---
        components: computed.components,
        otValue: computed.otValue,
        substituted: computed.substituted,
        computedTotal: computed.total,
        totalMismatch:
          computed.total !== null &&
          storedTotal !== null &&
          computed.total !== storedTotal,
        };
      })
    );
  })
);

module.exports = router;
