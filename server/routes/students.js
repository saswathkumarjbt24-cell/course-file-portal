// ---------------------------------------------------------------
// Routes mounted at /api/students
//
//   GET /api/students - every student, by registration number
//
// The per-course roll lives at /api/courses/:id/students. This endpoint is
// the institution-wide list, used by the screens that print a name list or a
// cover sheet rather than a course roll.
// ---------------------------------------------------------------

const express = require("express");
const pool = require("../db");
const { asyncHandler } = require("../helpers");

const router = express.Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT id, reg_number, name, current_sem
         FROM students
        ORDER BY reg_number`
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
