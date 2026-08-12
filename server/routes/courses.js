// ---------------------------------------------------------------
// Routes mounted at /api/courses
//
//   GET /api/courses                     - every course, with its nature
//   GET /api/courses/:id                 - one course, nature and mark scale
//   GET /api/courses/:id/outcomes        - course_outcomes + co_po_matrix
//   GET /api/courses/:id/students        - enrolled students, by reg_number
//   GET /api/courses/:id/assessments     - assessments, each with allocations
//   GET /api/courses/:id/attendance      - attendance percentages
//   GET /api/courses/:id/exit-survey     - indirect attainment values
//   GET /api/courses/:id/remedial        - remedial plans, classes, register
//
//   PUT /api/courses/:id/outcomes        - CO statements + articulation matrix
//   PUT /api/courses/:id/exit-survey     - indirect attainment values
//   PUT /api/courses/:id/attendance      - attendance percentages
//   PUT /api/courses/:id/remedial/:kind  - one remedial plan, end to end
//
// Every query is parameterised. Writes run through withTransaction.
// ---------------------------------------------------------------

const express = require("express");
const pool = require("../db");
const {
  asyncHandler,
  HttpError,
  ValidationError,
  withTransaction,
  requireId,
  parseId,
  num,
  isPlainObject,
  optionalNumber,
  isDateString,
  mapCourse,
  COURSE_SELECT,
  COURSE_FROM,
} = require("../helpers");

const router = express.Router();

const ASSESSMENT_KINDS = ["PT1", "PT2", "IP1", "IP2", "OT", "SEE"];
const REMEDIAL_STATUSES = ["PR", "AB", "NA"];

/** 404 unless the course exists. */
async function assertCourseExists(conn, courseId) {
  const [rows] = await conn.execute("SELECT id FROM courses WHERE id = ?", [
    courseId,
  ]);
  if (rows.length === 0) {
    throw new HttpError(404, `No course with id ${courseId}`);
  }
}

/** The set of student ids enrolled in a course. */
async function enrolledStudentIds(conn, courseId) {
  const [rows] = await conn.execute(
    `SELECT student_id FROM student_enrolments WHERE course_id = ?`,
    [courseId]
  );
  return new Set(rows.map((r) => r.student_id));
}

// =====================================================================
// READS
// =====================================================================

// ---------------------------------------------------------------------
// GET /api/courses
// ---------------------------------------------------------------------
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [rows] = await pool.execute(
      `SELECT ${COURSE_SELECT} ${COURSE_FROM} ORDER BY c.code`
    );
    res.json(rows.map(mapCourse));
  })
);

// ---------------------------------------------------------------------
// GET /api/courses/:id
// ---------------------------------------------------------------------
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const [rows] = await pool.execute(
      `SELECT ${COURSE_SELECT} ${COURSE_FROM} WHERE c.id = ?`,
      [courseId]
    );
    if (rows.length === 0) {
      throw new HttpError(404, `No course with id ${courseId}`);
    }
    res.json(mapCourse(rows[0]));
  })
);

// ---------------------------------------------------------------------
// GET /api/courses/:id/outcomes
//
// co_po_matrix holds only the cells that HAVE a correlation; the absence of a
// row is meaningful and is preserved rather than padded with zeros.
// outcome_code is ordered by its NUMBER so PO2 sorts before PO12.
// ---------------------------------------------------------------------
router.get(
  "/:id/outcomes",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    await assertCourseExists(pool, courseId);

    const [outcomes] = await pool.execute(
      `SELECT id, course_id, co_number, statement
         FROM course_outcomes
        WHERE course_id = ?
        ORDER BY co_number`,
      [courseId]
    );

    const [matrix] = await pool.execute(
      `SELECT id, course_id, co_number, outcome_type, outcome_code, value
         FROM co_po_matrix
        WHERE course_id = ?
        ORDER BY co_number,
                 outcome_type,
                 CAST(REGEXP_SUBSTR(outcome_code, '[0-9]+') AS UNSIGNED)`,
      [courseId]
    );

    res.json({
      courseOutcomes: outcomes.map((r) => ({
        id: r.id,
        courseId: r.course_id,
        coNumber: r.co_number,
        statement: r.statement,
      })),
      coPoMatrix: matrix.map((r) => ({
        id: r.id,
        courseId: r.course_id,
        coNumber: r.co_number,
        outcomeType: r.outcome_type,
        outcomeCode: r.outcome_code,
        value: r.value,
      })),
    });
  })
);

// ---------------------------------------------------------------------
// GET /api/courses/:id/students
//
// IN (SELECT ...) rather than a JOIN: the enrolment unique key contains
// nullable columns, so MySQL cannot guarantee one enrolment row per
// (student, course) and a JOIN could duplicate a student.
// ---------------------------------------------------------------------
router.get(
  "/:id/students",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    await assertCourseExists(pool, courseId);

    const [rows] = await pool.execute(
      `SELECT s.id, s.reg_number, s.name, s.current_sem
         FROM students AS s
        WHERE s.id IN (SELECT e.student_id
                         FROM student_enrolments AS e
                        WHERE e.course_id = ?)
        ORDER BY s.reg_number`,
      [courseId]
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

// ---------------------------------------------------------------------
// GET /api/courses/:id/assessments
//
// conducted_on is formatted to 'YYYY-MM-DD' in SQL. mysql2 would return a JS
// Date at LOCAL midnight and JSON.stringify would emit it as UTC, shifting the
// date back a day for any timezone east of Greenwich.
// ---------------------------------------------------------------------
router.get(
  "/:id/assessments",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    await assertCourseExists(pool, courseId);

    // ENUM ordering is by declaration order: PT1, PT2, IP1, IP2, OT, SEE.
    const [assessments] = await pool.execute(
      `SELECT a.id,
              a.course_id,
              a.kind,
              a.max_total,
              DATE_FORMAT(a.conducted_on, '%Y-%m-%d') AS conducted_on,
              a.split_mode,
              a.co_split_pattern_id,
              p.name AS co_split_pattern_name
         FROM assessments            AS a
         LEFT JOIN co_split_patterns AS p ON p.id = a.co_split_pattern_id
        WHERE a.course_id = ?
        ORDER BY a.kind`,
      [courseId]
    );

    const [allocations] = await pool.execute(
      `SELECT ca.id, ca.assessment_id, ca.co_number, ca.marks_allocated
         FROM co_allocations AS ca
         JOIN assessments    AS a ON a.id = ca.assessment_id
        WHERE a.course_id = ?
        ORDER BY ca.assessment_id, ca.co_number`,
      [courseId]
    );

    const byAssessment = new Map();
    for (const r of allocations) {
      if (!byAssessment.has(r.assessment_id)) byAssessment.set(r.assessment_id, []);
      byAssessment.get(r.assessment_id).push({
        id: r.id,
        assessmentId: r.assessment_id,
        coNumber: r.co_number,
        marksAllocated: num(r.marks_allocated),
      });
    }

    res.json(
      assessments.map((r) => ({
        id: r.id,
        courseId: r.course_id,
        kind: r.kind,
        maxTotal: num(r.max_total),
        conductedOn: r.conducted_on,
        splitMode: r.split_mode,
        coSplitPatternId: r.co_split_pattern_id,
        coSplitPatternName: r.co_split_pattern_name,
        coAllocations: byAssessment.get(r.id) || [],
      }))
    );
  })
);

// ---------------------------------------------------------------------
// GET /api/courses/:id/attendance
// ---------------------------------------------------------------------
router.get(
  "/:id/attendance",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    await assertCourseExists(pool, courseId);

    const [rows] = await pool.execute(
      `SELECT a.student_id, a.course_id, a.percentage
         FROM attendance AS a
         JOIN students   AS s ON s.id = a.student_id
        WHERE a.course_id = ?
        ORDER BY s.reg_number`,
      [courseId]
    );

    res.json(
      rows.map((r) => ({
        studentId: r.student_id,
        courseId: r.course_id,
        percentage: num(r.percentage),
      }))
    );
  })
);

// ---------------------------------------------------------------------
// GET /api/courses/:id/exit-survey
// ---------------------------------------------------------------------
router.get(
  "/:id/exit-survey",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    await assertCourseExists(pool, courseId);

    const [rows] = await pool.execute(
      `SELECT course_id, co_number, value
         FROM course_exit_survey
        WHERE course_id = ?
        ORDER BY co_number`,
      [courseId]
    );

    res.json(
      rows.map((r) => ({
        courseId: r.course_id,
        coNumber: r.co_number,
        value: num(r.value),
      }))
    );
  })
);

// ---------------------------------------------------------------------
// GET /api/courses/:id/remedial
//
// The whole remedial record for a course: one entry per (course, assessment)
// plan, each carrying its classes, the attendance register of each class, and
// the after-remedial marks.
//
// class_date goes through DATE_FORMAT for the same timezone reason as
// conducted_on.
// ---------------------------------------------------------------------
router.get(
  "/:id/remedial",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    await assertCourseExists(pool, courseId);

    const [schedules] = await pool.execute(
      `SELECT id, course_id, assessment_kind, venue
         FROM remedial_schedules
        WHERE course_id = ?
        ORDER BY assessment_kind`,
      [courseId]
    );
    if (schedules.length === 0) {
      res.json([]);
      return;
    }

    const [classes] = await pool.execute(
      `SELECT rc.id,
              rc.schedule_id,
              rc.co_number,
              DATE_FORMAT(rc.class_date, '%Y-%m-%d') AS class_date,
              rc.timing
         FROM remedial_classes    AS rc
         JOIN remedial_schedules  AS rs ON rs.id = rc.schedule_id
        WHERE rs.course_id = ?
        ORDER BY rc.schedule_id, rc.co_number`,
      [courseId]
    );

    const [register] = await pool.execute(
      `SELECT ra.remedial_class_id, ra.student_id, ra.status
         FROM remedial_attendance AS ra
         JOIN remedial_classes    AS rc ON rc.id = ra.remedial_class_id
         JOIN remedial_schedules  AS rs ON rs.id = rc.schedule_id
         JOIN students            AS s  ON s.id  = ra.student_id
        WHERE rs.course_id = ?
        ORDER BY ra.remedial_class_id, s.reg_number`,
      [courseId]
    );

    const [results] = await pool.execute(
      `SELECT a.kind, sa.student_id, rr.co_number, rr.after_remedial_mark
         FROM remedial_results    AS rr
         JOIN student_assessments AS sa ON sa.id = rr.student_assessment_id
         JOIN assessments         AS a  ON a.id  = sa.assessment_id
        WHERE a.course_id = ?
        ORDER BY a.kind, sa.student_id, rr.co_number`,
      [courseId]
    );

    const registerByClass = new Map();
    for (const r of register) {
      if (!registerByClass.has(r.remedial_class_id)) {
        registerByClass.set(r.remedial_class_id, []);
      }
      registerByClass.get(r.remedial_class_id).push({
        studentId: r.student_id,
        status: r.status,
      });
    }

    const classesBySchedule = new Map();
    for (const c of classes) {
      if (!classesBySchedule.has(c.schedule_id)) classesBySchedule.set(c.schedule_id, []);
      classesBySchedule.get(c.schedule_id).push({
        id: c.id,
        coNumber: c.co_number,
        date: c.class_date,
        timing: c.timing,
        attendance: registerByClass.get(c.id) || [],
      });
    }

    const resultsByKind = new Map();
    for (const r of results) {
      if (!resultsByKind.has(r.kind)) resultsByKind.set(r.kind, []);
      resultsByKind.get(r.kind).push({
        studentId: r.student_id,
        coNumber: r.co_number,
        afterRemedialMark: num(r.after_remedial_mark),
      });
    }

    res.json(
      schedules.map((s) => ({
        id: s.id,
        courseId: s.course_id,
        assessmentKind: s.assessment_kind,
        venue: s.venue,
        classes: classesBySchedule.get(s.id) || [],
        results: resultsByKind.get(s.assessment_kind) || [],
      }))
    );
  })
);

// =====================================================================
// WRITES
// =====================================================================

// ---------------------------------------------------------------------
// PUT /api/courses/:id/outcomes
//
// Body: { courseOutcomes: [{ coNumber, statement }],
//         coPoMatrix:     [{ coNumber, outcomeType, outcomeCode, value }] }
//
// MATRIX DELETE SEMANTICS
//   A matrix entry whose `value` is null, or which omits `value` entirely,
//   DELETES that cell. It is never stored as 0: in this schema the absence of
//   a row means "no correlation", and 0 is not a point on the 1..3 scale.
//   Any other value must be exactly 1, 2 or 3.
//
//   Only the cells PRESENT in the body are touched. A cell the body does not
//   mention is left alone, so a client may send one CO's row without wiping
//   the rest of the matrix.
//
// Both lists are applied in ONE transaction.
// ---------------------------------------------------------------------
router.put(
  "/:id/outcomes",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const body = req.body;

    if (!isPlainObject(body)) {
      throw new HttpError(400, "Body must be an object");
    }
    const outcomesIn = body.courseOutcomes === undefined ? [] : body.courseOutcomes;
    const matrixIn = body.coPoMatrix === undefined ? [] : body.coPoMatrix;
    if (!Array.isArray(outcomesIn) || !Array.isArray(matrixIn)) {
      throw new HttpError(400, "courseOutcomes and coPoMatrix must be arrays");
    }

    const result = await withTransaction(async (conn) => {
      await assertCourseExists(conn, courseId);

      const issues = [];
      const outcomes = [];
      const upserts = [];
      const deletes = [];
      const seenCo = new Set();
      const seenCell = new Set();

      outcomesIn.forEach((row, index) => {
        const fail = (message, extra = {}) =>
          issues.push({ list: "courseOutcomes", index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");
        const coNumber = parseId(row.coNumber);
        if (coNumber === null || coNumber > 127) {
          return fail("coNumber must be a positive integer", { coNumber: row.coNumber });
        }
        if (seenCo.has(coNumber)) return fail("duplicate coNumber", { coNumber });
        seenCo.add(coNumber);

        const statement =
          row.statement === undefined || row.statement === null
            ? null
            : String(row.statement);
        outcomes.push({ coNumber, statement });
      });

      matrixIn.forEach((row, index) => {
        const fail = (message, extra = {}) =>
          issues.push({ list: "coPoMatrix", index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const coNumber = parseId(row.coNumber);
        if (coNumber === null || coNumber > 127) {
          return fail("coNumber must be a positive integer", { coNumber: row.coNumber });
        }

        const outcomeType = row.outcomeType;
        if (outcomeType !== "PO" && outcomeType !== "PSO") {
          return fail("outcomeType must be 'PO' or 'PSO'", { coNumber, outcomeType });
        }

        const outcomeCode =
          typeof row.outcomeCode === "string" ? row.outcomeCode.trim() : "";
        if (outcomeCode === "" || outcomeCode.length > 10) {
          return fail("outcomeCode must be a string of 1..10 characters", {
            coNumber,
            outcomeCode: row.outcomeCode,
          });
        }

        const key = `${coNumber}|${outcomeType}|${outcomeCode}`;
        if (seenCell.has(key)) {
          return fail("duplicate matrix cell", { coNumber, outcomeType, outcomeCode });
        }
        seenCell.add(key);

        // null or absent -> delete the cell rather than store a zero.
        if (row.value === null || row.value === undefined || row.value === "") {
          deletes.push({ coNumber, outcomeType, outcomeCode });
          return;
        }

        const value = Number(row.value);
        if (!Number.isInteger(value) || value < 1 || value > 3) {
          return fail(
            "value must be 1, 2 or 3, or null to remove the cell",
            { coNumber, outcomeType, outcomeCode, value: row.value }
          );
        }
        upserts.push({ coNumber, outcomeType, outcomeCode, value });
      });

      if (issues.length > 0) throw new ValidationError(issues);

      for (const o of outcomes) {
        await conn.execute(
          `INSERT INTO course_outcomes (course_id, co_number, statement)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE statement = ?`,
          [courseId, o.coNumber, o.statement, o.statement]
        );
      }

      for (const cell of upserts) {
        await conn.execute(
          `INSERT INTO co_po_matrix
             (course_id, co_number, outcome_type, outcome_code, value)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE value = ?`,
          [
            courseId,
            cell.coNumber,
            cell.outcomeType,
            cell.outcomeCode,
            cell.value,
            cell.value,
          ]
        );
      }

      let deleted = 0;
      for (const cell of deletes) {
        const [r] = await conn.execute(
          `DELETE FROM co_po_matrix
            WHERE course_id = ? AND co_number = ?
              AND outcome_type = ? AND outcome_code = ?`,
          [courseId, cell.coNumber, cell.outcomeType, cell.outcomeCode]
        );
        deleted += r.affectedRows;
      }

      return {
        courseId,
        courseOutcomesSaved: outcomes.length,
        matrixCellsSaved: upserts.length,
        matrixCellsDeleted: deleted,
      };
    });

    res.json(result);
  })
);

// ---------------------------------------------------------------------
// PUT /api/courses/:id/exit-survey
//
// Body: an array of { coNumber, value }.
//
// `value` is the level students reported, on the same 0..3 scale as the
// direct attainment level, so it is validated against that range. A
// percentage pasted in by mistake (e.g. 75) is rejected rather than stored.
// ---------------------------------------------------------------------
router.put(
  "/:id/exit-survey",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const body = req.body;

    if (!Array.isArray(body)) {
      throw new HttpError(400, "Body must be an array of { coNumber, value }");
    }

    const result = await withTransaction(async (conn) => {
      await assertCourseExists(conn, courseId);

      const issues = [];
      const rows = [];
      const seen = new Set();

      body.forEach((row, index) => {
        const fail = (message, extra = {}) => issues.push({ index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const coNumber = parseId(row.coNumber);
        if (coNumber === null || coNumber > 127) {
          return fail("coNumber must be a positive integer", { coNumber: row.coNumber });
        }
        if (seen.has(coNumber)) return fail("duplicate coNumber", { coNumber });
        seen.add(coNumber);

        const value = optionalNumber(row.value);
        if (!value.ok || value.value === null) {
          return fail("value must be a number", { coNumber, value: row.value });
        }
        if (value.value < 0 || value.value > 3) {
          return fail("value must be between 0 and 3 (an attainment level)", {
            coNumber,
            value: value.value,
          });
        }
        rows.push({ coNumber, value: value.value });
      });

      if (issues.length > 0) throw new ValidationError(issues);

      for (const r of rows) {
        await conn.execute(
          `INSERT INTO course_exit_survey (course_id, co_number, value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = ?`,
          [courseId, r.coNumber, r.value, r.value]
        );
      }

      return { courseId, saved: rows.length };
    });

    res.json(result);
  })
);

// ---------------------------------------------------------------------
// PUT /api/courses/:id/attendance
//
// Body: an array of { studentId, percentage }.
//
// academic_year and semester are NULL and both sit inside the unique key, so
// ON DUPLICATE KEY UPDATE would not match. The existence check uses <=> and
// the branch is explicit -- mysql2 reports 0 affected rows for an UPDATE that
// changes nothing, which would look like "row absent" and insert a duplicate.
// ---------------------------------------------------------------------
router.put(
  "/:id/attendance",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const body = req.body;

    if (!Array.isArray(body)) {
      throw new HttpError(400, "Body must be an array of { studentId, percentage }");
    }

    const result = await withTransaction(async (conn) => {
      await assertCourseExists(conn, courseId);
      const enrolled = await enrolledStudentIds(conn, courseId);

      const issues = [];
      const rows = [];
      const seen = new Set();

      body.forEach((row, index) => {
        const fail = (message, extra = {}) => issues.push({ index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const studentId = parseId(row.studentId);
        if (studentId === null) {
          return fail("studentId must be a positive integer", {
            studentId: row.studentId,
          });
        }
        if (!enrolled.has(studentId)) {
          return fail(`student ${studentId} is not enrolled in course ${courseId}`, {
            studentId,
          });
        }
        if (seen.has(studentId)) return fail("duplicate studentId", { studentId });
        seen.add(studentId);

        const pct = optionalNumber(row.percentage);
        if (!pct.ok) {
          return fail("percentage must be a number or null", {
            studentId,
            percentage: row.percentage,
          });
        }
        if (pct.value !== null && (pct.value < 0 || pct.value > 100)) {
          return fail("percentage must be between 0 and 100", {
            studentId,
            percentage: pct.value,
          });
        }
        rows.push({ studentId, percentage: pct.value });
      });

      if (issues.length > 0) throw new ValidationError(issues);

      for (const r of rows) {
        const [existing] = await conn.execute(
          `SELECT id FROM attendance
            WHERE student_id     =   ?
              AND course_id      =   ?
              AND academic_year <=>  NULL
              AND semester      <=>  NULL`,
          [r.studentId, courseId]
        );
        if (existing.length > 0) {
          await conn.execute(`UPDATE attendance SET percentage = ? WHERE id = ?`, [
            r.percentage,
            existing[0].id,
          ]);
        } else {
          await conn.execute(
            `INSERT INTO attendance
               (student_id, course_id, percentage, academic_year, semester)
             VALUES (?, ?, ?, NULL, NULL)`,
            [r.studentId, courseId, r.percentage]
          );
        }
      }

      return { courseId, saved: rows.length };
    });

    res.json(result);
  })
);

// ---------------------------------------------------------------------
// PUT /api/courses/:id/remedial/:kind
//
// Body: { venue,
//         classes:    [{ coNumber, date, timing }],
//         attendance: [{ coNumber, studentId, status }],
//         results:    [{ studentId, coNumber, afterRemedialMark }] }
//
// All four tables are written in ONE transaction.
//
// DATES
//   `date` must be exactly YYYY-MM-DD and is passed to MySQL as that string.
//   No JS Date is ever constructed, so nothing can shift a day in IST, and
//   the read path formats it back with DATE_FORMAT.
//
// CLASSES ARE UPSERTED, NOT REPLACED
//   A class the body does not mention is left alone rather than deleted.
//   Deleting would cascade its attendance register away, which is far more
//   destructive than leaving a stale class behind for the caller to correct.
//
// RESULTS NEED AN ATTEMPT
//   remedial_results hangs off student_assessments, so a result can only be
//   recorded for a student who has a mark row for that assessment. A result
//   for a student with no attempt is a 400, not a silent skip.
// ---------------------------------------------------------------------
router.put(
  "/:id/remedial/:kind",
  asyncHandler(async (req, res) => {
    const courseId = requireId(req);
    const kind = String(req.params.kind || "").toUpperCase();
    const body = req.body;

    if (!ASSESSMENT_KINDS.includes(kind)) {
      throw new HttpError(
        400,
        `Invalid assessment kind '${req.params.kind}'. Expected one of ${ASSESSMENT_KINDS.join(", ")}`
      );
    }
    if (!isPlainObject(body)) {
      throw new HttpError(400, "Body must be an object");
    }

    const classesIn = body.classes === undefined ? [] : body.classes;
    const attendanceIn = body.attendance === undefined ? [] : body.attendance;
    const resultsIn = body.results === undefined ? [] : body.results;
    if (
      !Array.isArray(classesIn) ||
      !Array.isArray(attendanceIn) ||
      !Array.isArray(resultsIn)
    ) {
      throw new HttpError(400, "classes, attendance and results must be arrays");
    }

    const result = await withTransaction(async (conn) => {
      await assertCourseExists(conn, courseId);
      const enrolled = await enrolledStudentIds(conn, courseId);

      // The assessment this plan follows, needed to resolve results.
      const [assessmentRows] = await conn.execute(
        `SELECT id FROM assessments WHERE course_id = ? AND kind = ?`,
        [courseId, kind]
      );
      const assessmentId = assessmentRows.length > 0 ? assessmentRows[0].id : null;

      const allocByCo = new Map();
      if (assessmentId !== null) {
        const [allocRows] = await conn.execute(
          `SELECT co_number, marks_allocated FROM co_allocations WHERE assessment_id = ?`,
          [assessmentId]
        );
        for (const r of allocRows) allocByCo.set(r.co_number, num(r.marks_allocated));
      }

      const issues = [];

      // ---- venue ----
      let venue = null;
      if (body.venue !== undefined && body.venue !== null) {
        if (typeof body.venue !== "string") {
          issues.push({ field: "venue", message: "venue must be a string or null" });
        } else if (body.venue.length > 150) {
          issues.push({ field: "venue", message: "venue must be 150 characters or fewer" });
        } else {
          venue = body.venue;
        }
      }

      // ---- classes ----
      const classes = [];
      const seenClassCo = new Set();
      classesIn.forEach((row, index) => {
        const fail = (message, extra = {}) =>
          issues.push({ list: "classes", index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const coNumber = parseId(row.coNumber);
        if (coNumber === null || coNumber > 127) {
          return fail("coNumber must be a positive integer", { coNumber: row.coNumber });
        }
        if (seenClassCo.has(coNumber)) return fail("duplicate coNumber", { coNumber });
        seenClassCo.add(coNumber);

        let classDate = null;
        if (row.date !== undefined && row.date !== null && row.date !== "") {
          if (!isDateString(row.date)) {
            return fail("date must be a real calendar date in YYYY-MM-DD form", {
              coNumber,
              date: row.date,
            });
          }
          classDate = row.date;
        }

        let timing = null;
        if (row.timing !== undefined && row.timing !== null && row.timing !== "") {
          if (typeof row.timing !== "string" || row.timing.length > 60) {
            return fail("timing must be a string of 60 characters or fewer", {
              coNumber,
              timing: row.timing,
            });
          }
          timing = row.timing;
        }

        classes.push({ coNumber, classDate, timing });
      });

      // ---- attendance ----
      const register = [];
      const seenRegister = new Set();
      attendanceIn.forEach((row, index) => {
        const fail = (message, extra = {}) =>
          issues.push({ list: "attendance", index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const coNumber = parseId(row.coNumber);
        if (coNumber === null || coNumber > 127) {
          return fail("coNumber must be a positive integer", { coNumber: row.coNumber });
        }
        const studentId = parseId(row.studentId);
        if (studentId === null) {
          return fail("studentId must be a positive integer", {
            studentId: row.studentId,
          });
        }
        if (!enrolled.has(studentId)) {
          return fail(`student ${studentId} is not enrolled in course ${courseId}`, {
            studentId,
          });
        }
        const status = row.status === undefined || row.status === null ? "NA" : row.status;
        if (!REMEDIAL_STATUSES.includes(status)) {
          return fail(`status must be one of ${REMEDIAL_STATUSES.join(", ")}`, {
            studentId,
            coNumber,
            status: row.status,
          });
        }
        const key = `${coNumber}|${studentId}`;
        if (seenRegister.has(key)) {
          return fail("duplicate (coNumber, studentId)", { coNumber, studentId });
        }
        seenRegister.add(key);

        register.push({ coNumber, studentId, status });
      });

      // ---- results ----
      const results = [];
      const seenResult = new Set();
      resultsIn.forEach((row, index) => {
        const fail = (message, extra = {}) =>
          issues.push({ list: "results", index, ...extra, message });

        if (!isPlainObject(row)) return fail("entry must be an object");

        const studentId = parseId(row.studentId);
        if (studentId === null) {
          return fail("studentId must be a positive integer", {
            studentId: row.studentId,
          });
        }
        if (!enrolled.has(studentId)) {
          return fail(`student ${studentId} is not enrolled in course ${courseId}`, {
            studentId,
          });
        }
        const coNumber = parseId(row.coNumber);
        if (coNumber === null || coNumber > 127) {
          return fail("coNumber must be a positive integer", { coNumber: row.coNumber });
        }
        const key = `${studentId}|${coNumber}`;
        if (seenResult.has(key)) {
          return fail("duplicate (studentId, coNumber)", { studentId, coNumber });
        }
        seenResult.add(key);

        const mark = optionalNumber(row.afterRemedialMark);
        if (!mark.ok) {
          return fail("afterRemedialMark must be a number or null", {
            studentId,
            coNumber,
          });
        }
        if (mark.value !== null) {
          if (mark.value < 0) {
            return fail("afterRemedialMark must not be negative", {
              studentId,
              coNumber,
              afterRemedialMark: mark.value,
            });
          }
          const allocated = allocByCo.get(coNumber);
          if (allocated !== undefined && allocated !== null && mark.value > allocated) {
            return fail(
              `afterRemedialMark ${mark.value} exceeds the CO${coNumber} allocation of ${allocated}`,
              { studentId, coNumber, afterRemedialMark: mark.value }
            );
          }
        }
        results.push({ studentId, coNumber, afterRemedialMark: mark.value });
      });

      if (results.length > 0 && assessmentId === null) {
        issues.push({
          list: "results",
          message: `course ${courseId} has no ${kind} assessment, so no remedial result can be recorded against it`,
        });
      }

      if (issues.length > 0) throw new ValidationError(issues);

      // ---------------- write ----------------
      await conn.execute(
        `INSERT INTO remedial_schedules (course_id, assessment_kind, venue)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE venue = ?`,
        [courseId, kind, venue, venue]
      );
      const [scheduleRows] = await conn.execute(
        `SELECT id FROM remedial_schedules WHERE course_id = ? AND assessment_kind = ?`,
        [courseId, kind]
      );
      const scheduleId = scheduleRows[0].id;

      for (const c of classes) {
        await conn.execute(
          `INSERT INTO remedial_classes (schedule_id, co_number, class_date, timing)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE class_date = ?, timing = ?`,
          [scheduleId, c.coNumber, c.classDate, c.timing, c.classDate, c.timing]
        );
      }

      // Classes must exist before their register can be written.
      const [classRows] = await conn.execute(
        `SELECT id, co_number FROM remedial_classes WHERE schedule_id = ?`,
        [scheduleId]
      );
      const classIdByCo = new Map(classRows.map((r) => [r.co_number, r.id]));

      const registerIssues = [];
      for (const entry of register) {
        const classId = classIdByCo.get(entry.coNumber);
        if (classId === undefined) {
          registerIssues.push({
            list: "attendance",
            coNumber: entry.coNumber,
            studentId: entry.studentId,
            message: `no remedial class for CO${entry.coNumber} in the ${kind} plan; send it in "classes" first`,
          });
          continue;
        }
        await conn.execute(
          `INSERT INTO remedial_attendance (remedial_class_id, student_id, status)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE status = ?`,
          [classId, entry.studentId, entry.status, entry.status]
        );
      }
      if (registerIssues.length > 0) throw new ValidationError(registerIssues);

      let resultsSaved = 0;
      const resultIssues = [];
      for (const r of results) {
        const [saRows] = await conn.execute(
          `SELECT id FROM student_assessments
            WHERE assessment_id = ? AND student_id = ?`,
          [assessmentId, r.studentId]
        );
        if (saRows.length === 0) {
          resultIssues.push({
            list: "results",
            studentId: r.studentId,
            coNumber: r.coNumber,
            message: `student ${r.studentId} has no ${kind} mark row, so there is no attempt to attach a remedial result to`,
          });
          continue;
        }
        await conn.execute(
          `INSERT INTO remedial_results
             (student_assessment_id, co_number, after_remedial_mark)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE after_remedial_mark = ?`,
          [saRows[0].id, r.coNumber, r.afterRemedialMark, r.afterRemedialMark]
        );
        resultsSaved += 1;
      }
      if (resultIssues.length > 0) throw new ValidationError(resultIssues);

      return {
        courseId,
        assessmentKind: kind,
        scheduleId,
        classesSaved: classes.length,
        attendanceSaved: register.length,
        resultsSaved,
      };
    });

    res.json(result);
  })
);

module.exports = router;
