// BEGIN REMOVABLE -- one heading per sheet
// ---------------------------------------------------------------
// THE HEADING AT THE TOP OF A COURSE-FILE SHEET, IN ONE PLACE.
//
// WHAT WAS WRONG.
//   Six sheets carry a capitalised document heading of their own -- the
//   wording the department's workbook uses. Inside the Full Course File
//   those same six also sat under a numbered part title, so the sheet
//   announced itself twice, with the institution band's rule between the
//   two:
//         3. PEO / PO / PSO
//         -----------------------
//         PEOs, POs AND PSOs
//   The department wants one heading, carrying the section number and the
//   capitalised wording: "3. PEOs, POs AND PSOs".
//
// WHY A SHARED CONSTANT AND NOT A STRING IN EACH FILE.
//   The number lived ONLY in FullCourseFile.jsx, as a `number` prop on
//   each <Part>. The standalone sheet had no way to know it. Putting the
//   number and the wording together here is what lets the standalone
//   sheet and its embedded copy print the same heading without the two
//   being typed out twice and drifting apart.
//
// THE NUMBERS ARE THE WORKBOOK'S, and they are not contiguous here:
//   only the seven sheets that have a capitalised heading appear. Sheets
//   4, 6-13, 16 and 17 have no heading of their own, never duplicated, and
//   keep the numbered part title FullCourseFile.jsx gives them.
//
// SHEET 18 IS THE ODD ONE. It is not one component embedded twice: the
//   standalone ClosingReport.jsx and the Full Course File's ClosingSection
//   are two renderings of the same sheet, and only the standalone one had
//   the capitalised heading. Both now read it from here, which is the only
//   way the two can be held to the same wording.
//
// THE WORDING IS THE DEPARTMENT'S, copied from the sheets exactly as it
//   stood. Nothing is re-cased: "PEOs, POs AND PSOs" is mixed case on the
//   department's own sheet because the plural s is lower case, and it
//   stays that way.
// ---------------------------------------------------------------

const SHEETS = {
  cover: { number: 1, heading: 'COURSE FILE' },
  vision: { number: 2, heading: 'VISION AND MISSION' },
  outcomes: { number: 3, heading: 'PEOs, POs AND PSOs' },
  students: { number: 5, heading: 'STUDENT NAME LIST' },
  attendance: { number: 14, heading: 'ATTENDANCE' },
  internal: { number: 15, heading: 'INTERNAL MARKS' },
  closing: { number: 18, heading: 'COURSE FILE CLOSING REPORT' },
}

/** "14. ATTENDANCE" -- the one heading that sheet prints, embedded or not. */
export function sheetHeading(key) {
  const sheet = SHEETS[key]
  if (!sheet) throw new Error(`sheetHeading: no sheet named "${key}"`)
  return `${sheet.number}. ${sheet.heading}`
}
// END REMOVABLE -- one heading per sheet
