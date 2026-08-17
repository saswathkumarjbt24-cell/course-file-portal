// ---------------------------------------------------------------
// Routes mounted at /api/assessments
//
//   GET /api/assessments/:id/marks - the mark sheet: one row per ENROLLED
//                                    student, whether or not a mark exists
//   PUT /api/assessments/:id/marks - save the whole mark sheet in one
//                                    transaction, and recompute the affected
//                                    internal marks with it
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
  bool,
  isPlainObject,
  optionalNumber,
} = require("../helpers");
const { requireAssessmentAccess } = require("../auth");
const { recomputeInternalMarks } = require("../internalMarks");

const router = express.Router();

// ---------------------------------------------------------------------
// OWNERSHIP
//
// An assessment inherits its course's permissions: a mark sheet is part of a
// course file, not a separately owned thing. The gate resolves the
// assessment's course_id and applies the same rule GET /api/courses/:id does,
// so there is no second definition of who may enter marks.
//
// Both routes here are under `/:id`, so this covers the read and the write.
// ---------------------------------------------------------------------
router.use("/:id", requireAssessmentAccess);

// ---------------------------------------------------------------------
// The question-to-CO mapping for a 'lookup' assessment.
//
// Transcribed from client/src/utils/coSplit.js mapSplitToCOs. The PT2 mapping
// is DELIBERATELY REVERSED with respect to PT1: the small 10-mark Q3 carries
// the CO the two tests share (CO3), and the two 20-mark questions carry the
// later COs. That is how the source workbook allocates them. It is not a bug
// and must not be "tidied up" into a straight Q1->CO3, Q2->CO4, Q3->CO5.
//
// OT is 'lookup' too but has NO mapping, exactly as in the frontend: the
// optional test feeds the internal mark only and forms no part of CO
// attainment. A null here means "derive nothing", not "unknown".
// ---------------------------------------------------------------------
function mapSplitToCOs(split, kind) {
  if (!split) return null;
  if (kind === "PT1") return { 1: split.q1, 2: split.q2, 3: split.q3 };
  if (kind === "PT2") return { 3: split.q3, 4: split.q2, 5: split.q1 };
  return null;
}

/**
 * The per-CO marks a 'lookup' assessment derives from a total.
 * Returns [] when the assessment has no split pattern, the kind has no
 * question-to-CO mapping (OT), or the total has no row in the lookup --
 * never a guessed or interpolated split.
 */
async function deriveLookupCoMarks(conn, assessment, total) {
  if (assessment.coSplitPatternId === null) return [];
  if (total === null || !Number.isInteger(total)) return [];

  const [rows] = await conn.execute(
    `SELECT q1, q2, q3
       FROM co_split_values
      WHERE pattern_id = ? AND total_mark = ?`,
    [assessment.coSplitPatternId, total]
  );
  if (rows.length === 0) return [];

  const byCo = mapSplitToCOs(rows[0], assessment.kind);
  if (!byCo) return [];

  return Object.keys(byCo).map((coNumber) => ({
    coNumber: Number(coNumber),
    marksObtained: byCo[coNumber],
  }));
}

/** Load an assessment or 404. */
async function loadAssessment(conn, assessmentId) {
  const [rows] = await conn.execute(
    `SELECT id, course_id, kind, max_total, split_mode, co_split_pattern_id
       FROM assessments
      WHERE id = ?`,
    [assessmentId]
  );
  if (rows.length === 0) {
    throw new HttpError(404, `No assessment with id ${assessmentId}`);
  }
  return {
    id: rows[0].id,
    courseId: rows[0].course_id,
    kind: rows[0].kind,
    maxTotal: num(rows[0].max_total),
    splitMode: rows[0].split_mode,
    coSplitPatternId: rows[0].co_split_pattern_id,
  };
}

// ---------------------------------------------------------------------
// GET /api/assessments/:id/marks
//
// THREE STATES, KEPT DISTINCT
//   The row list is driven by student_enrolments, LEFT JOINed to
//   student_assessments, so a student who has no mark row at all still
//   appears. That lets the frontend tell apart:
//     studentAssessmentId null  -> not entered yet   (totalObtained null,
//                                                     isAbsent null)
//     isAbsent true             -> sat nothing       (totalObtained null)
//     totalObtained 0           -> entered, scored 0
//
// coMarks IS EMPTY FOR 'lookup' ASSESSMENTS
//   PT1, PT2 and OT store no per-CO marks by design. An empty coMarks is
//   correct, not missing data -- branch on splitMode, never on coMarks.length.
// ---------------------------------------------------------------------
router.get(
  "/:id/marks",
  asyncHandler(async (req, res) => {
    const assessmentId = requireId(req);
    const assessment = await loadAssessment(pool, assessmentId);

    const [rows] = await pool.execute(
      `SELECT s.id AS student_id,
              s.reg_number,
              s.name,
              sa.id             AS student_assessment_id,
              sa.total_obtained,
              sa.is_absent
         FROM students AS s
         LEFT JOIN student_assessments AS sa
                ON sa.student_id    = s.id
               AND sa.assessment_id = ?
        WHERE s.id IN (SELECT e.student_id
                         FROM student_enrolments AS e
                        WHERE e.course_id = ?)
        ORDER BY s.reg_number`,
      [assessmentId, assessment.courseId]
    );

    const [coMarks] = await pool.execute(
      `SELECT scm.student_assessment_id, scm.co_number, scm.marks_obtained
         FROM student_co_marks     AS scm
         JOIN student_assessments  AS sa ON sa.id = scm.student_assessment_id
        WHERE sa.assessment_id = ?
        ORDER BY scm.student_assessment_id, scm.co_number`,
      [assessmentId]
    );

    const byStudentAssessment = new Map();
    for (const m of coMarks) {
      if (!byStudentAssessment.has(m.student_assessment_id)) {
        byStudentAssessment.set(m.student_assessment_id, []);
      }
      byStudentAssessment.get(m.student_assessment_id).push({
        coNumber: m.co_number,
        marksObtained: num(m.marks_obtained),
      });
    }

    res.json(
      rows.map((r) => ({
        studentId: r.student_id,
        regNumber: r.reg_number,
        name: r.name,
        studentAssessmentId: r.student_assessment_id,
        totalObtained: num(r.total_obtained),
        isAbsent: bool(r.is_absent),
        coMarks:
          r.student_assessment_id === null
            ? []
            : byStudentAssessment.get(r.student_assessment_id) || [],
      }))
    );
  })
);

// ---------------------------------------------------------------------
// PUT /api/assessments/:id/marks
//
// Body: an array of { studentId, totalObtained, isAbsent, coMarks }
//       coMarks is [{ coNumber, marksObtained }].
//
// WHOLE-ARRAY TRANSACTION
//   Validation runs over the ENTIRE array before a single row is written. If
//   any row fails, a 400 is thrown listing every offending row and nothing is
//   saved. The write itself is inside a transaction, so a failure partway
//   through rolls the whole array back too.
//
// LOOKUP ASSESSMENTS IGNORE THE SENT coMarks
//   For split_mode 'lookup' the per-CO marks are DERIVED from the total via
//   co_split_values and any coMarks in the body are discarded, so the database
//   stays the source of truth. For 'manual' they are stored as given.
//
// ABSENT
//   is_absent true, total_obtained null, and every per-CO mark row deleted.
//   Any total sent alongside isAbsent:true is ignored rather than rejected.
//
// INTERNAL MARKS
//   Recomputed for exactly the students in the body, on the SAME connection
//   and inside the SAME transaction, so the risk report can never disagree
//   with the mark sheet. A student whose total comes out null is skipped, not
//   zeroed.
// ---------------------------------------------------------------------
router.put(
  "/:id/marks",
  asyncHandler(async (req, res) => {
    const assessmentId = requireId(req);
    const body = req.body;

    if (!Array.isArray(body)) {
      throw new HttpError(400, "Body must be an array of mark rows");
    }

    const result = await withTransaction(async (conn) => {
      const assessment = await loadAssessment(conn, assessmentId);

      const [allocRows] = await conn.execute(
        `SELECT co_number, marks_allocated
           FROM co_allocations
          WHERE assessment_id = ?`,
        [assessmentId]
      );
      const allocByCo = new Map(
        allocRows.map((r) => [r.co_number, num(r.marks_allocated)])
      );

      const [enrolledRows] = await conn.execute(
        `SELECT student_id FROM student_enrolments WHERE course_id = ?`,
        [assessment.courseId]
      );
      const enrolled = new Set(enrolledRows.map((r) => r.student_id));

      // ---------------- validate everything first ----------------
      const issues = [];
      const prepared = [];
      const seenStudents = new Set();

      body.forEach((row, index) => {
        const fail = (message, extra = {}) =>
          issues.push({ index, ...extra, message });

        if (!isPlainObject(row)) {
          fail("row must be an object");
          return;
        }

        const studentId = parseId(row.studentId);
        if (studentId === null) {
          fail("studentId must be a positive integer", { studentId: row.studentId });
          return;
        }
        if (!enrolled.has(studentId)) {
          fail(
            `student ${studentId} is not enrolled in course ${assessment.courseId}`,
            { studentId }
          );
          return;
        }
        if (seenStudents.has(studentId)) {
          fail("duplicate studentId in body", { studentId });
          return;
        }
        seenStudents.add(studentId);

        const isAbsent = row.isAbsent === true;

        // Absent: the total is forced null and any coMarks are dropped.
        if (isAbsent) {
          prepared.push({ studentId, isAbsent: true, total: null, coMarks: [] });
          return;
        }

        const total = optionalNumber(row.totalObtained);
        if (!total.ok) {
          fail("totalObtained must be a number or null", { studentId });
          return;
        }
        if (total.value !== null) {
          if (total.value < 0) {
            fail("totalObtained must not be negative", {
              studentId,
              totalObtained: total.value,
            });
            return;
          }
          if (assessment.maxTotal !== null && total.value > assessment.maxTotal) {
            fail(
              `totalObtained ${total.value} exceeds the assessment maximum of ${assessment.maxTotal}`,
              { studentId, totalObtained: total.value }
            );
            return;
          }
        }

        // 'lookup' derives its CO marks server-side; anything sent is ignored.
        if (assessment.splitMode === "lookup") {
          prepared.push({
            studentId,
            isAbsent: false,
            total: total.value,
            coMarks: null, // filled in from the split table during the write
          });
          return;
        }

        // 'manual': the sent CO marks ARE the data.
        const rawCoMarks = row.coMarks;
        if (rawCoMarks !== undefined && rawCoMarks !== null && !Array.isArray(rawCoMarks)) {
          fail("coMarks must be an array", { studentId });
          return;
        }

        const coMarks = [];
        const seenCo = new Set();
        let coFailed = false;

        for (const entry of rawCoMarks || []) {
          if (!isPlainObject(entry)) {
            fail("each coMarks entry must be an object", { studentId });
            coFailed = true;
            break;
          }
          const coNumber = parseId(entry.coNumber);
          if (coNumber === null || coNumber > 127) {
            fail("coNumber must be a positive integer", {
              studentId,
              coNumber: entry.coNumber,
            });
            coFailed = true;
            break;
          }
          if (!allocByCo.has(coNumber)) {
            fail(
              `CO${coNumber} has no mark allocation on this assessment`,
              { studentId, coNumber }
            );
            coFailed = true;
            break;
          }
          if (seenCo.has(coNumber)) {
            fail("duplicate coNumber for this student", { studentId, coNumber });
            coFailed = true;
            break;
          }
          seenCo.add(coNumber);

          const mark = optionalNumber(entry.marksObtained);
          if (!mark.ok) {
            fail("marksObtained must be a number or null", { studentId, coNumber });
            coFailed = true;
            break;
          }
          if (mark.value !== null) {
            if (mark.value < 0) {
              fail("marksObtained must not be negative", {
                studentId,
                coNumber,
                marksObtained: mark.value,
              });
              coFailed = true;
              break;
            }
            const allocated = allocByCo.get(coNumber);
            if (allocated !== null && mark.value > allocated) {
              fail(
                `CO${coNumber} mark ${mark.value} exceeds its allocation of ${allocated}`,
                { studentId, coNumber, marksObtained: mark.value }
              );
              coFailed = true;
              break;
            }
          }
          coMarks.push({ coNumber, marksObtained: mark.value });
        }

        if (coFailed) return;
        prepared.push({ studentId, isAbsent: false, total: total.value, coMarks });
      });

      if (issues.length > 0) {
        throw new ValidationError(issues);
      }

      // ---------------- write ----------------
      let derivedRows = 0;

      for (const row of prepared) {
        await conn.execute(
          `INSERT INTO student_assessments
             (assessment_id, student_id, total_obtained, is_absent)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE total_obtained = ?, is_absent = ?`,
          [
            assessmentId,
            row.studentId,
            row.total,
            row.isAbsent ? 1 : 0,
            row.total,
            row.isAbsent ? 1 : 0,
          ]
        );

        // ON DUPLICATE KEY UPDATE does not give a usable insertId on the
        // update branch, so the id is read back explicitly.
        const [saRows] = await conn.execute(
          `SELECT id FROM student_assessments
            WHERE assessment_id = ? AND student_id = ?`,
          [assessmentId, row.studentId]
        );
        const studentAssessmentId = saRows[0].id;

        // PUT replaces the whole per-CO set for this attempt. Deleting first
        // also implements the absent rule, which stores no CO marks at all.
        await conn.execute(
          `DELETE FROM student_co_marks WHERE student_assessment_id = ?`,
          [studentAssessmentId]
        );

        let toInsert = row.coMarks;
        if (toInsert === null) {
          toInsert = await deriveLookupCoMarks(conn, assessment, row.total);
          derivedRows += toInsert.length;
        }

        for (const m of toInsert) {
          await conn.execute(
            `INSERT INTO student_co_marks
               (student_assessment_id, co_number, marks_obtained)
             VALUES (?, ?, ?)`,
            [studentAssessmentId, m.coNumber, m.marksObtained]
          );
        }
      }

      const internal = await recomputeInternalMarks(
        conn,
        assessment.courseId,
        prepared.map((r) => r.studentId)
      );

      return {
        assessmentId,
        courseId: assessment.courseId,
        kind: assessment.kind,
        splitMode: assessment.splitMode,
        studentsSaved: prepared.length,
        coMarksDerived: assessment.splitMode === "lookup" ? derivedRows : null,
        internalMarks: internal,
      };
    });

    res.json(result);
  })
);

module.exports = router;
