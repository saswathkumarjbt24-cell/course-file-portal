// ---------------------------------------------------------------
// Internal-mark recomputation.
//
// !! THIS IS A MIRROR OF THE FRONTEND RULE !!
//   The rule below is transcribed from client/src/pages/InternalMarks.jsx
//   (rawMark / scale / scaledIp / componentsFor and the total). It is
//   duplicated here, not shared, because the frontend copy is the printed
//   mark sheet and the rails forbid changing it.
//
//   THE TWO MUST BE KEPT IN STEP. If the substitution rule, the scaling or
//   the rounding changes on either side, the internal mark sheet and the risk
//   report will disagree and neither will be obviously wrong.
//
// THE RULE
//   INT = round(PT1_scaled + PT2_scaled + IP)
//   PT_scaled  = mark * nature.ptNMax / assessment.max_total
//   IP         = (IP1 + IP2 obtained) / (IP1 + IP2 out of) * nature.ipMax
//
//   If a student was ABSENT for a periodical test AND has an Optional Test
//   mark, the OT mark substitutes for that absent test. One optional test
//   replaces AT MOST ONE absent periodical test, and PT1 is evaluated first
//   so a double absence puts the substitution on PT1.
//
//   The workbook never substitutes OT for a merely LOW periodical-test mark,
//   only for an absence, so that case is deliberately not implemented. Both
//   that and which test the OT should cover in a double absence are
//   UNCONFIRMED in the source and carried over as-is from the frontend.
//
// !! EDITING co_split_values LEAVES STORED MARKS STALE !!
//   PUT /api/assessments/:id/marks derives the per-CO marks of a 'lookup'
//   assessment from co_split_values and PERSISTS them into student_co_marks.
//   Those rows are a snapshot of the lookup AS IT WAS WHEN THE MARK WAS SAVED.
//
//   If co_split_values is ever corrected, every student_co_marks row already
//   stored for a 'lookup' assessment becomes stale, and nothing recomputes it
//   automatically. The frontend now prefers the stored rows over deriving, so
//   the stale numbers would be the ones displayed.
//
//   A change to that table therefore needs a deliberate recompute pass: re-PUT
//   every affected assessment's marks, which re-derives and rewrites both the
//   per-CO rows and the internal marks. There is no migration that does this
//   for you.
//
// A MISSING COMPONENT IS NOT ZERO
//   A component with no assessment row, or no mark row for the student, is
//   'none' and is excluded from the sum entirely. If NOTHING contributes, the
//   total is null and the caller leaves the stored row alone rather than
//   writing a 0 -- a course with no assessments entered must not have its
//   internal marks zeroed.
// ---------------------------------------------------------------

const { num } = require("./helpers");

const IP_KINDS = ["IP1", "IP2"];

/**
 * The state of one assessment for one student.
 *   'none'   - no assessment of that kind, or no mark row for this student
 *   'absent' - a row exists and records an absence (or a null total)
 *   'ok'     - a row exists with a mark
 */
function rawMark(marksByKind, kind) {
  const m = marksByKind.get(kind);
  if (!m) return { state: "none" };
  if (m.isAbsent || m.totalObtained === null) {
    return { state: "absent", outOf: m.maxTotal };
  }
  return { state: "ok", raw: m.totalObtained, outOf: m.maxTotal };
}

/** Scale a mark onto the nature's scale: mark * scaleMax / assessment max. */
function scale(mark, scaleMax) {
  if (mark.state !== "ok") return null;
  if (scaleMax === null || scaleMax === undefined) return null;
  if (!mark.outOf) return null;
  return (mark.raw * scaleMax) / mark.outOf;
}

/** IP1 and IP2 together make up the innovative-practice component. */
function scaledIp(marksByKind, ipMax) {
  if (ipMax === null || ipMax === undefined) return { state: "none" };

  let obtained = 0;
  let outOf = 0;
  let seen = 0;
  let absent = 0;

  for (const kind of IP_KINDS) {
    const mark = rawMark(marksByKind, kind);
    if (mark.state === "none") continue;
    seen += 1;
    outOf += mark.outOf;
    if (mark.state === "absent") absent += 1;
    else obtained += mark.raw;
  }

  if (seen === 0 || outOf === 0) return { state: "none" };
  if (absent === seen) return { state: "absent", value: 0 };
  return { state: "ok", value: (obtained / outOf) * ipMax };
}

/**
 * The stored value of a component.
 * 'none' -> null (nothing to record)
 * 'absent' -> 0 (that is the figure that entered the sum)
 * otherwise the scaled value, to 2dp so it round-trips through DECIMAL(6,2).
 */
function componentValue(mark) {
  if (mark.state === "none") return null;
  if (mark.value === null || mark.value === undefined) return null;
  return Math.round(mark.value * 100) / 100;
}

/**
 * Compute one student's internal mark for one course.
 * `marksByKind` is a Map of assessment kind -> {maxTotal, totalObtained,
 * isAbsent}, holding ONLY the kinds where an assessment exists AND the
 * student has a mark row.
 */
function computeInternalMark(nature, marksByKind) {
  const pt1Max = nature ? nature.pt1Max : null;
  const pt2Max = nature ? nature.pt2Max : null;
  const ipMax = nature ? nature.ipMax : null;

  const ot = rawMark(marksByKind, "OT");
  const hasOt = ot.state === "ok";
  let otSpent = false;

  const build = (kind, ptScaleMax) => {
    const mark = rawMark(marksByKind, kind);
    if (mark.state === "absent" && hasOt && !otSpent) {
      otSpent = true;
      return { state: "substituted", value: scale(ot, ptScaleMax) };
    }
    if (mark.state === "absent") return { state: "absent", value: 0 };
    if (mark.state === "none") return { state: "none" };
    return { state: "ok", value: scale(mark, ptScaleMax) };
  };

  // PT1 is built first so the single substitution lands on it, matching the
  // evaluation order in the frontend.
  const pt1 = build("PT1", pt1Max);
  const pt2 = build("PT2", pt2Max);
  const ip = scaledIp(marksByKind, ipMax);

  const contributes = [pt1, pt2, ip].filter((m) => m.state !== "none");
  const total =
    contributes.length === 0
      ? null
      : Math.round(contributes.reduce((sum, m) => sum + (m.value ?? 0), 0));

  return {
    // Flat values, as stored in internal_marks.
    pt1: componentValue(pt1),
    pt2: componentValue(pt2),
    ip: componentValue(ip),
    total,
    substituted: pt1.state === "substituted" || pt2.state === "substituted",

    // The same three components with their STATE attached, which the printed
    // mark sheet needs and the stored columns cannot express:
    //   'ok'          - a mark was entered
    //   'absent'      - the student was absent; counts as 0 in the total
    //   'substituted' - the student was absent AND the optional test stood in
    //   'none'        - no assessment of that kind, or no row for this student
    // Without this, an absence and a genuine 0 are indistinguishable, and the
    // "(OT)" marker cannot be drawn at all.
    components: {
      pt1: { state: pt1.state, value: componentValue(pt1) },
      pt2: { state: pt2.state, value: componentValue(pt2) },
      ip: { state: ip.state, value: componentValue(ip) },
    },

    // The optional test SCALED onto the PT1 scale -- the figure the printed
    // "Optional Test" column shows, not the raw mark. null when the student
    // has no optional-test mark.
    otValue: hasOt ? componentValue({ state: "ok", value: scale(ot, pt1Max) }) : null,
  };
}

/**
 * Everything needed to compute internal marks, read once for the whole
 * database: the mark scale of each course, and every student's assessment
 * rows grouped by course and student.
 *
 * Used by the reports endpoint, which derives the component STATES on the fly
 * rather than storing them. Deriving here and storing only the totals is what
 * lets the mark sheet render "(OT)" and "Absent" without a schema change.
 */
async function loadMarkContext(conn) {
  const [natures] = await conn.execute(
    `SELECT c.id AS course_id, n.pt1_max, n.pt2_max, n.ip_max
       FROM courses        AS c
       JOIN course_natures AS n ON n.id = c.nature_id`
  );
  const natureByCourse = new Map(
    natures.map((r) => [
      r.course_id,
      { pt1Max: num(r.pt1_max), pt2Max: num(r.pt2_max), ipMax: num(r.ip_max) },
    ])
  );

  const [rows] = await conn.execute(
    `SELECT a.course_id, sa.student_id, a.kind, a.max_total,
            sa.total_obtained, sa.is_absent
       FROM assessments         AS a
       JOIN student_assessments AS sa ON sa.assessment_id = a.id`
  );

  const marks = new Map();
  for (const r of rows) {
    const key = `${r.course_id}|${r.student_id}`;
    if (!marks.has(key)) marks.set(key, new Map());
    marks.get(key).set(r.kind, {
      maxTotal: num(r.max_total),
      totalObtained: num(r.total_obtained),
      isAbsent: Boolean(r.is_absent),
    });
  }

  return {
    natureByCourse,
    /** Compute one (course, student). An absent key means no assessment rows
     *  at all, which yields a null total -- not a zero. */
    compute(courseId, studentId) {
      return computeInternalMark(
        natureByCourse.get(courseId) ?? null,
        marks.get(`${courseId}|${studentId}`) ?? new Map()
      );
    },
  };
}

/**
 * Insert or update one internal_marks row.
 *
 * academic_year and semester are NULL, and both sit inside the unique key, so
 * a plain ON DUPLICATE KEY UPDATE would not match an existing row. The
 * existence check uses the NULL-safe <=> operator, and the branch is explicit
 * rather than relying on affectedRows -- mysql2 reports 0 affected rows for an
 * UPDATE that changes nothing, which would look like "row absent" and insert
 * a duplicate.
 */
async function upsertInternalMark(conn, studentId, courseId, computed) {
  const [existing] = await conn.execute(
    `SELECT id
       FROM internal_marks
      WHERE student_id      =   ?
        AND course_id       =   ?
        AND academic_year  <=>  NULL
        AND semester       <=>  NULL`,
    [studentId, courseId]
  );

  if (existing.length > 0) {
    await conn.execute(
      `UPDATE internal_marks
          SET pt1 = ?, pt2 = ?, ip = ?, total = ?
        WHERE id = ?`,
      [computed.pt1, computed.pt2, computed.ip, computed.total, existing[0].id]
    );
    return "updated";
  }

  await conn.execute(
    `INSERT INTO internal_marks
       (student_id, course_id, pt1, pt2, ip, total, academic_year, semester)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)`,
    [studentId, courseId, computed.pt1, computed.pt2, computed.ip, computed.total]
  );
  return "inserted";
}

/**
 * Recompute and store the internal mark of each given student in one course.
 * Runs on the caller's transaction connection, so it commits or rolls back
 * together with the marks that triggered it -- the whole point is that the
 * risk report and the mark sheet can never disagree.
 *
 * A student whose total comes out null (no component contributes anything) is
 * SKIPPED, not zeroed.
 */
async function recomputeInternalMarks(conn, courseId, studentIds) {
  if (!studentIds || studentIds.length === 0) {
    return { written: 0, skipped: 0 };
  }

  const [natureRows] = await conn.execute(
    `SELECT n.pt1_max, n.pt2_max, n.ip_max
       FROM courses        AS c
       JOIN course_natures AS n ON n.id = c.nature_id
      WHERE c.id = ?`,
    [courseId]
  );
  const nature =
    natureRows.length > 0
      ? {
          pt1Max: num(natureRows[0].pt1_max),
          pt2Max: num(natureRows[0].pt2_max),
          ipMax: num(natureRows[0].ip_max),
        }
      : null;

  // Every mark row of the course, in one query rather than one per student.
  const [rows] = await conn.execute(
    `SELECT sa.student_id, a.kind, a.max_total, sa.total_obtained, sa.is_absent
       FROM assessments         AS a
       JOIN student_assessments AS sa ON sa.assessment_id = a.id
      WHERE a.course_id = ?`,
    [courseId]
  );

  const byStudent = new Map();
  for (const r of rows) {
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, new Map());
    byStudent.get(r.student_id).set(r.kind, {
      maxTotal: num(r.max_total),
      totalObtained: num(r.total_obtained),
      isAbsent: Boolean(r.is_absent),
    });
  }

  let written = 0;
  let skipped = 0;
  for (const studentId of studentIds) {
    const marksByKind = byStudent.get(studentId) || new Map();
    const computed = computeInternalMark(nature, marksByKind);
    if (computed.total === null) {
      skipped += 1;
      continue;
    }
    await upsertInternalMark(conn, studentId, courseId, computed);
    written += 1;
  }

  return { written, skipped };
}

module.exports = { computeInternalMark, recomputeInternalMarks, loadMarkContext };
