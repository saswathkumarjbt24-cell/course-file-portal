// ---------------------------------------------------------------
// API DATA LAYER
//
// One async function per data need. Each one returns data in EXACTLY the
// shape the matching mockData export has, so a screen can swap its import
// for a call here without changing a line of its rendering.
//
// TWO MODES
//   VITE_API_URL set   -> fetch from the Express API and reshape
//   VITE_API_URL unset -> return the mockData value, with NO network access
//   The mode is decided once, here. No screen ever tests it.
//
// WHY THE RESHAPING
//   The API is course-scoped (/api/courses/:id/assessments); the fixtures are
//   flat global arrays that screens filter by courseId. These functions fan
//   out over the courses and concatenate, so the screens keep filtering
//   exactly as they always did.
//
// TWO RULES THAT MATTER MORE THAN THEY LOOK
//   1. A student with NO mark row comes back from the API with
//      studentAssessmentId === null. That is "not entered", and such rows are
//      DROPPED here so the resulting array matches the fixtures, where an
//      un-entered mark simply has no row. It is never read as isAbsent false
//      or as a zero.
//   2. A 'lookup' assessment can legitimately carry an EMPTY coMarks array --
//      PT1, PT2 and OT derive their per-CO marks from the split table. No
//      code here or downstream may treat an empty coMarks as "no data";
//      splitMode is the only correct thing to branch on.
// ---------------------------------------------------------------

import * as mock from './mockData'

const API_URL = import.meta.env.VITE_API_URL

/** True when the app is talking to the API rather than the fixtures. */
export function isApiMode() {
  return Boolean(API_URL)
}

// The only CO split pattern the schema seeds. Named rather than hardcoded by
// id, matching how migration 002 defines it.
const SPLIT_PATTERN_NAME = 'PT 50 (20/20/10)'

async function request(path) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`)
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}${path}. Is the server running?`)
  }
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body.message || body.error || ''
    } catch {
      // non-JSON error body; the status alone will have to do
    }
    throw new Error(`GET ${path} failed with ${res.status}${detail ? ` — ${detail}` : ''}`)
  }
  return res.json()
}

// One in-flight request per path. Several screens ask for the same reference
// data, and the mark bundle fans out over every assessment, so without this
// the same URL would be fetched repeatedly.
const cache = new Map()
function get(path) {
  if (!cache.has(path)) {
    cache.set(
      path,
      request(path).catch((err) => {
        cache.delete(path)
        throw err
      }),
    )
  }
  return cache.get(path)
}

/** Drop every cached response. Call after a save so reads see the new data. */
export function invalidate() {
  cache.clear()
  marksBundle = null
}

/**
 * A save. Returns the API's JSON on success.
 *
 * On a 400 the thrown Error carries `.issues`, the per-row list the server
 * built BEFORE writing anything -- a rejected save changed nothing, so the
 * caller must keep whatever the user typed on screen.
 */
async function put(path, body) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}${path}. Is the server running?`)
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    // non-JSON body; the status alone will have to do
  }

  if (!res.ok) {
    const err = new Error(
      json?.message || json?.error || `PUT ${path} failed with ${res.status}`,
    )
    err.status = res.status
    err.issues = Array.isArray(json?.issues) ? json.issues : null
    throw err
  }
  return json
}

// ---------------------------------------------------------------
// Sign-in
//
// The ID token is passed through UNTOUCHED and is never decoded here. Every
// check that matters -- signature, audience, verified email, allowed domain,
// and whether the person is on staff -- happens on the server.
// ---------------------------------------------------------------

/**
 * Exchange a Google ID token for the faculty record it belongs to.
 * Resolves with the same shape /api/faculty returns; rejects with the
 * server's own message on 401 (not verified) or 403 (wrong domain, or not
 * registered as faculty).
 */
export async function signInWithGoogle(credential) {
  if (!API_URL) {
    // Nothing to verify against. The caller should not have offered the
    // button in this build, but refuse rather than invent a session.
    throw new Error(
      'Google sign-in needs the API server. This build runs on sample data only.',
    )
  }

  let res
  try {
    res = await fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}. Is the server running?`)
  }

  let json = null
  try {
    json = await res.json()
  } catch {
    // non-JSON body; the status alone will have to do
  }

  if (!res.ok) {
    const err = new Error(
      json?.message || json?.error || `Sign-in failed with ${res.status}`,
    )
    err.status = res.status
    throw err
  }
  return json
}

/**
 * Whether the SERVER can do Google sign-in. Lets the page tell a missing
 * server configuration apart from a rejected account.
 *
 * Never rejects: a server that is down is reported as "not configured with a
 * reachable server", so the sign-in page still renders.
 */
export async function fetchAuthConfig() {
  if (!API_URL) return { googleConfigured: false, serverReachable: false }
  try {
    const config = await get('/api/auth/config')
    return { ...config, serverReachable: true }
  } catch {
    return { googleConfigured: false, serverReachable: false }
  }
}

// ---------------------------------------------------------------
// Saves
//
// In MOCK mode every one of these is a no-op that resolves to { mock: true },
// so the public demo keeps working with no server and no network request --
// the screens show their existing "Saved (mock)" line unchanged.
//
// On a real save the response cache is dropped, so the next read reflects
// what was just written.
// ---------------------------------------------------------------

export async function saveAssessmentMarks(assessmentId, rows) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/assessments/${assessmentId}/marks`, rows)
  invalidate()
  return result
}

export async function saveCourseOutcomes(courseId, body) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/courses/${courseId}/outcomes`, body)
  invalidate()
  return result
}

export async function saveCourseExitSurvey(courseId, rows) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/courses/${courseId}/exit-survey`, rows)
  invalidate()
  return result
}

export async function saveCourseAttendance(courseId, rows) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/courses/${courseId}/attendance`, rows)
  invalidate()
  return result
}

export async function saveRemedial(courseId, kind, body) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/courses/${courseId}/remedial/${kind}`, body)
  invalidate()
  return result
}

/**
 * The cover-page offering details.
 * `body` is { programme, batch, academicYear, yearOfStudy, semester, section }
 * and REPLACES all six -- an omitted field is cleared, not preserved.
 */
export async function saveCourseMeta(courseId, body) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/courses/${courseId}/meta`, body)
  invalidate()
  return result
}

/** The closing-report action lines: [{ seq, statement }]. */
export async function saveClosingActions(courseId, rows) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/courses/${courseId}/closing`, rows)
  invalidate()
  return result
}

/**
 * The whole enrolled list: [{ regNumber, name }].
 *
 * Rejects with a 400 carrying `.issues` when a student being removed still
 * has marks in the course. The caller must show that rather than swallow it:
 * the removal did not happen and nothing else in the list was saved either.
 */
export async function saveCourseStudents(courseId, rows) {
  if (!API_URL) return { mock: true }
  const result = await put(`/api/courses/${courseId}/students`, rows)
  invalidate()
  return result
}

/** One scope's vision and ordered missions. */
export async function saveVisionMission(body) {
  if (!API_URL) return { mock: true }
  const result = await put('/api/reference/vision-mission', body)
  invalidate()
  return result
}

/** One department's ordered PEO list. */
export async function savePeos(body) {
  if (!API_URL) return { mock: true }
  const result = await put('/api/reference/peos', body)
  invalidate()
  return result
}

/** One department's ordered PSO list. */
export async function savePsos(body) {
  if (!API_URL) return { mock: true }
  const result = await put('/api/reference/psos', body)
  invalidate()
  return result
}

// ---------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------

export async function fetchCourses() {
  if (!API_URL) return mock.courses
  const rows = await get('/api/courses')
  return rows.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    natureId: c.natureId,
    regulationYear: c.regulationYear,
    department: c.department,
    coCount: c.coCount,
    coTargetPercent: c.coTargetPercent,
  }))
}

export async function fetchCourseNatures() {
  if (!API_URL) return mock.courseNatures
  return get('/api/reference/course-natures')
}

export async function fetchStudents() {
  if (!API_URL) return mock.students
  return get('/api/students')
}

export async function fetchFacultyList() {
  if (!API_URL) return mock.facultyList
  return get('/api/faculty')
}

export async function fetchInstitution() {
  if (!API_URL) return mock.institution
  return get('/api/reference/institution')
}

export async function fetchAttainmentBands() {
  if (!API_URL) return mock.attainmentBands
  const rows = await get('/api/reference/attainment-bands')
  return rows.map((b) => ({ minPercent: b.minPercent, level: b.level }))
}

export async function fetchAttainmentConstants() {
  if (!API_URL) return mock.attainmentConstants
  return get('/api/reference/attainment-constants')
}

/**
 * The hand-authored CO split lookup. Never computed, interpolated or rounded
 * -- it is returned exactly as the workbook recorded it.
 */
export async function fetchCoSplitValues() {
  if (!API_URL) return mock.coSplitValues
  const { values } = await get(
    `/api/reference/co-split/${encodeURIComponent(SPLIT_PATTERN_NAME)}`,
  )
  return values.map((v) => ({ totalMark: v.totalMark, q1: v.q1, q2: v.q2, q3: v.q3 }))
}

export async function fetchProgramOutcomes() {
  if (!API_URL) return mock.programOutcomes
  const { programOutcomes } = await get('/api/reference/program-outcomes')
  return programOutcomes.map((p) => ({ code: p.code, title: p.title }))
}

export async function fetchProgramOutcomeStatements() {
  if (!API_URL) return mock.programOutcomeStatements
  const { programOutcomes } = await get('/api/reference/program-outcomes')
  return programOutcomes.map((p) => ({ code: p.code, statement: p.statement }))
}

/**
 * PSO columns for the articulation matrix.
 * The fixture carries three unlabelled placeholders; the database carries the
 * real department PSOs, of which there are two. `title` is the statement,
 * which is what the matrix header tooltip shows.
 */
export async function fetchProgramSpecificOutcomes() {
  if (!API_URL) return mock.programSpecificOutcomes
  const { programSpecificOutcomes } = await get('/api/reference/program-outcomes')
  return programSpecificOutcomes.map((p) => ({ code: p.code, title: p.statement }))
}

export async function fetchPsoStatements() {
  if (!API_URL) return mock.psoStatements
  const { programSpecificOutcomes } = await get('/api/reference/program-outcomes')
  return programSpecificOutcomes.map((p) => ({
    department: p.department,
    code: p.code,
    statement: p.statement,
  }))
}

export async function fetchPeos() {
  if (!API_URL) return mock.peos
  const rows = await get('/api/reference/peos')
  return rows.map((p) => ({ code: p.code, statement: p.statement }))
}

/**
 * The same PEOs WITH their department, which the editor needs: department is
 * half of the unique key, and null there means "applies to every department".
 * fetchPeos above drops it because the printed list does not show it.
 */
export async function fetchPeoRecords() {
  if (!API_URL) return mock.peos.map((p) => ({ department: null, ...p }))
  const rows = await get('/api/reference/peos')
  return rows.map((p) => ({
    department: p.department,
    code: p.code,
    statement: p.statement,
  }))
}

async function fetchVisionMissions() {
  return get('/api/reference/vision-missions')
}

export async function fetchInstitutionVisionMission() {
  if (!API_URL) return mock.institutionVisionMission
  const rows = await fetchVisionMissions()
  const row = rows.find((r) => r.scope === 'institution')
  return row
    ? { vision: row.vision, missions: row.missions }
    : { vision: '', missions: [] }
}

export async function fetchDepartmentVisionMission() {
  if (!API_URL) return mock.departmentVisionMission
  const rows = await fetchVisionMissions()
  const row = rows.find((r) => r.scope === 'department')
  return row
    ? { department: row.department, vision: row.vision, missions: row.missions }
    : { department: '', vision: '', missions: [] }
}

// ---------------------------------------------------------------
// Course-scoped data, flattened to the fixtures' global shape
// ---------------------------------------------------------------

/**
 * The cover-page offering details of every course, plus the read-only
 * allocation names.
 *
 * Fans out over /api/courses/:id rather than reading the list endpoint,
 * because only the single-course endpoint carries these columns -- adding
 * them to GET /api/courses would change a response other screens rely on.
 */
export async function fetchCourseMeta() {
  if (!API_URL) return mock.courseMeta
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}`)))
  return per.map((c) => ({
    courseId: c.id,
    programme: c.programme,
    batch: c.batch,
    academicYear: c.academicYear,
    yearOfStudy: c.yearOfStudy,
    semester: c.semester,
    section: c.section,
    handledBy: c.handledBy ?? [],
    fileIncharge: c.fileIncharge ?? [],
  }))
}

/** The closing-report action lines of every course. */
export async function fetchClosingActions() {
  if (!API_URL) return mock.closingReportActions
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}/closing`)))
  return per.flat().map((a) => ({
    courseId: a.courseId,
    seq: a.seq,
    statement: a.statement,
  }))
}

/**
 * The ENROLLED roll of every course, tagged with its courseId.
 *
 * Different from fetchStudents(), which is the institution-wide list. A
 * screen that adds or removes an enrolment, or saves anything validated
 * against the roll, must use this one: the attendance and mark endpoints
 * reject a student who is not enrolled in the course being saved.
 *
 * In MOCK mode every student is on every roll, which is what the fixtures
 * have always shown.
 */
export async function fetchCourseStudents() {
  if (!API_URL) {
    return mock.courses.flatMap((c) =>
      mock.students.map((s) => ({ courseId: c.id, ...s })),
    )
  }
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}/students`)))
  return courses.flatMap((c, i) =>
    per[i].map((s) => ({
      courseId: c.id,
      id: s.id,
      regNumber: s.regNumber,
      name: s.name,
      currentSem: s.currentSem,
    })),
  )
}

/** The raw per-course assessment payload, allocations included. */
async function fetchAssessmentPayload() {
  const courses = await fetchCourses()
  const perCourse = await Promise.all(
    courses.map((c) => get(`/api/courses/${c.id}/assessments`)),
  )
  return perCourse.flat()
}

export async function fetchAssessments() {
  if (!API_URL) return mock.assessments
  const rows = await fetchAssessmentPayload()
  return rows.map((a) => ({
    id: a.id,
    courseId: a.courseId,
    kind: a.kind,
    maxTotal: a.maxTotal,
    conductedOn: a.conductedOn,
    splitMode: a.splitMode,
  }))
}

export async function fetchCoAllocations() {
  if (!API_URL) return mock.coAllocations
  const rows = await fetchAssessmentPayload()
  return rows.flatMap((a) =>
    a.coAllocations.map((c) => ({
      id: c.id,
      assessmentId: c.assessmentId,
      coNumber: c.coNumber,
      marksAllocated: c.marksAllocated,
    })),
  )
}

export async function fetchCourseOutcomes() {
  if (!API_URL) return mock.courseOutcomes
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}/outcomes`)))
  return per.flatMap((p) =>
    p.courseOutcomes.map((o) => ({
      id: o.id,
      courseId: o.courseId,
      coNumber: o.coNumber,
      statement: o.statement,
    })),
  )
}

export async function fetchCoPoMatrix() {
  if (!API_URL) return mock.coPoMatrix
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}/outcomes`)))
  return per.flatMap((p) =>
    p.coPoMatrix.map((m) => ({
      courseId: m.courseId,
      coNumber: m.coNumber,
      outcomeType: m.outcomeType,
      outcomeCode: m.outcomeCode,
      value: m.value,
    })),
  )
}

export async function fetchAttendance() {
  if (!API_URL) return mock.attendance
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}/attendance`)))
  return per.flat().map((a) => ({
    studentId: a.studentId,
    courseId: a.courseId,
    percentage: a.percentage,
  }))
}

export async function fetchCourseExitSurvey() {
  if (!API_URL) return mock.courseExitSurvey
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}/exit-survey`)))
  return per.flat().map((s) => ({
    courseId: s.courseId,
    coNumber: s.coNumber,
    value: s.value,
  }))
}

export async function fetchRemedialSchedule() {
  if (!API_URL) return mock.remedialSchedule
  const courses = await fetchCourses()
  const per = await Promise.all(courses.map((c) => get(`/api/courses/${c.id}/remedial`)))
  return per.flat().map((r) => ({
    id: r.id,
    courseId: r.courseId,
    assessmentKind: r.assessmentKind,
    venue: r.venue,
    classes: r.classes.map((c) => ({
      coNumber: c.coNumber,
      date: c.date,
      timing: c.timing,
    })),
  }))
}

/**
 * The internal-mark rows WITH the derived component states the printed mark
 * sheet needs -- per-component 'ok' / 'absent' / 'substituted' / 'none', the
 * scaled optional-test value, and the server's own recomputed total.
 *
 * Returns null in MOCK mode. There is no fixture for it: the states are
 * derived, not stored, so InternalMarks.jsx keeps its own local computation
 * as the fallback and uses it only when this returns null.
 */
export async function fetchInternalMarksDetail() {
  if (!API_URL) return null
  const rows = await get('/api/reports/internal-marks')
  return rows.map((r) => ({
    studentId: r.studentId,
    courseId: r.courseId,
    // Stored -- what the record says.
    total: r.total,
    // Derived on the server from the assessment rows.
    components: r.components,
    otValue: r.otValue,
    substituted: r.substituted,
    computedTotal: r.computedTotal,
    totalMismatch: r.totalMismatch,
  }))
}

export async function fetchInternalMarks() {
  if (!API_URL) return mock.internalMarks
  const rows = await get('/api/reports/internal-marks')
  return rows.map((r) => ({
    studentId: r.studentId,
    courseId: r.courseId,
    pt1: r.pt1,
    pt2: r.pt2,
    ip: r.ip,
    total: r.total,
  }))
}

// ---------------------------------------------------------------
// Marks
//
// One pass over every assessment builds BOTH studentAssessments and
// studentCoMarks, because both come from the same endpoint.
// ---------------------------------------------------------------

let marksBundle = null

async function fetchMarksBundle() {
  if (!marksBundle) {
    marksBundle = (async () => {
      const assessments = await fetchAssessmentPayload()
      const perAssessment = await Promise.all(
        assessments.map((a) => get(`/api/assessments/${a.id}/marks`)),
      )

      const studentAssessments = []
      const studentCoMarks = []

      assessments.forEach((assessment, index) => {
        for (const row of perAssessment[index]) {
          // No mark row exists for this student. That is "not entered", which
          // the fixtures represent by the absence of a row -- so drop it.
          // isAbsent is null here and must never be read as false.
          if (row.studentAssessmentId === null) continue

          studentAssessments.push({
            id: row.studentAssessmentId,
            assessmentId: assessment.id,
            studentId: row.studentId,
            totalObtained: row.totalObtained,
            isAbsent: row.isAbsent === true,
          })

          // May be empty for a 'lookup' assessment. That is correct, not
          // missing data -- the per-CO marks come from the split table.
          for (const m of row.coMarks) {
            studentCoMarks.push({
              assessmentId: assessment.id,
              studentId: row.studentId,
              coNumber: m.coNumber,
              marksObtained: m.marksObtained,
            })
          }
        }
      })

      return { studentAssessments, studentCoMarks }
    })().catch((err) => {
      marksBundle = null
      throw err
    })
  }
  return marksBundle
}

export async function fetchStudentAssessments() {
  if (!API_URL) return mock.studentAssessments
  const { studentAssessments } = await fetchMarksBundle()
  return studentAssessments
}

export async function fetchStudentCoMarks() {
  if (!API_URL) return mock.studentCoMarks
  const { studentCoMarks } = await fetchMarksBundle()
  return studentCoMarks
}
