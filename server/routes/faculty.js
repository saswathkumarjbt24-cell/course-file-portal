// ---------------------------------------------------------------
// Routes mounted at /api/faculty
//
//   GET /api/faculty             - all active faculty
//   GET /api/faculty/:id/courses - that member's allocated courses, with the
//                                  course nature (mark scale) joined in
//
// Read-only. Every query is parameterised through pool.execute.
// ---------------------------------------------------------------

const express = require("express");
const pool = require("../db");
const { asyncHandler, HttpError, requireId, mapCourse } = require("../helpers");

const router = express.Router();

// ---------------------------------------------------------------------
// GET /api/faculty
// Only is_active members: the inactive ones must stay in the table so their
// name still resolves on course files they signed, but they are not offered
// as a choice.
// ---------------------------------------------------------------------
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, name, email, department, designation
         FROM faculty
        WHERE is_active = 1
        ORDER BY name`
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        department: r.department,
        designation: r.designation,
      }))
    );
  })
);

// ---------------------------------------------------------------------
// GET /api/faculty/:id/courses
//
// One entry per ALLOCATION, not per course: the same course can appear twice
// if a member is both 'handling' and 'incharge' of it.
//
// is_active is deliberately NOT filtered here -- an inactive member's course
// files still have to be readable.
//
// A faculty member with no allocations is a 200 with an empty array; only an
// unknown id is a 404.
// ---------------------------------------------------------------------
router.get(
  "/:id/courses",
  asyncHandler(async (req, res) => {
    const facultyId = requireId(req);

    const [exists] = await pool.execute(
      "SELECT id FROM faculty WHERE id = ?",
      [facultyId]
    );
    if (exists.length === 0) {
      throw new HttpError(404, `No faculty member with id ${facultyId}`);
    }

    const [rows] = await pool.execute(
      `SELECT c.id,
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
              n.notes AS nature_notes,
              ca.role,
              ca.academic_year,
              ca.semester,
              ca.section
         FROM course_allocations AS ca
         JOIN courses            AS c ON c.id = ca.course_id
         JOIN course_natures     AS n ON n.id = c.nature_id
        WHERE ca.faculty_id = ?
        ORDER BY c.code, ca.role`,
      [facultyId]
    );

    res.json(
      rows.map((r) => ({
        ...mapCourse(r),
        role: r.role,
        academicYear: r.academic_year,
        semester: r.semester,
        section: r.section,
      }))
    );
  })
);

module.exports = router;
