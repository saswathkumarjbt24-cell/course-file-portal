// ---------------------------------------------------------------
// Routes mounted at /api/students
//
//   GET /api/students - the students the caller may see, by registration
//                       number
//
// The per-course roll lives at /api/courses/:id/students. This endpoint is
// the wider list, used by the screens that print a name list or a cover sheet
// rather than a course roll.
//
// SCOPED, NOT INSTITUTION-WIDE ANY MORE
//   A student is visible when they are enrolled in a course the caller may
//   reach: allocated courses for a faculty member, the department's courses
//   for a hod, everything for an admin. So the eight screens that read this
//   list still find every name they need -- a mark sheet only ever shows
//   students of a course the caller can already open -- while nobody can pull
//   the institution's whole roll from an authenticated session.
//
//   Filtered rather than refused, matching GET /api/courses: a role-based
//   403 here would blank eight screens for the ordinary faculty who are the
//   people meant to use them.
//
//   AN ADMIN'S RESPONSE IS UNCHANGED, including a student enrolled in
//   nothing at all. For everyone else enrolment is what makes a student
//   visible, so a student on no course appears to nobody but an admin -- an
//   unenrolled student is not part of anyone's course file.
// ---------------------------------------------------------------

const express = require("express");
const pool = require("../db");
const { asyncHandler } = require("../helpers");
const { courseScope, seesEverything } = require("../auth");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    // An admin needs no EXISTS at all, so the unrestricted query stays the
    // literal query this endpoint has always run.
    const scope = seesEverything(req.faculty)
      ? null
      : courseScope(req.faculty, "c");

    const [rows] = await pool.execute(
      `SELECT id, reg_number, name, current_sem
         FROM students AS s
        ${
          scope === null
            ? ""
            : `WHERE EXISTS (SELECT 1
                               FROM student_enrolments AS e
                               JOIN courses            AS c ON c.id = e.course_id
                              WHERE e.student_id = s.id
                                AND ${scope.sql})`
        }
        ORDER BY reg_number`,
      scope === null ? [] : scope.params
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        regNumber: r.reg_number,
        name: r.name,
        currentSem: r.current_sem,
      }))
    );
  })
);

module.exports = router;
