// BEGIN REMOVABLE -- printed letterhead
import letterheadImage from '../assets/letterhead.jpg'
import './Letterhead.css'

/* ---------------------------------------------------------------
   The official college letterhead band -- logo, institution name,
   accreditation line, address, phone, fax, email and web address,
   all inside the one image the department's own Excel uses.

   ON A DOCUMENT SHEET IT SHOWS ON SCREEN AS WELL AS IN PRINT, so the
   display matches the paper. The typed institution heading a sheet used
   to carry is marked `letterhead-replaced` and is now withdrawn from
   both. Where that heading also named the DEPARTMENT -- which is not on
   the image -- only the institution half carries the class and the
   department line stays.

   printOnly is for the three working screens (mark entry, standalone CO
   attainment, standalone course setup). They are not document sheets and
   carry no typed institution heading, so their band stays on paper only
   and their display is unchanged.

   ONE DEFINITION. No screen carries its own copy of this markup.
   --------------------------------------------------------------- */

export default function Letterhead({ printOnly = false }) {
  return (
    <div className={printOnly ? 'letterhead' : 'letterhead letterhead--screen'}>
      {/* The intrinsic 2134x376 is stated so the aspect ratio is known
          before the image decodes; the stylesheet scales it by width
          alone, so it is never stretched and never cropped.
          An <img>, not a CSS background: browsers drop background
          images when printing. The alt text carries the institution
          name because the typed heading that used to carry it is now
          hidden on screen too. */}
      <img
        className="letterhead__img"
        src={letterheadImage}
        width="2134"
        height="376"
        alt="Bannari Amman Institute of Technology, Sathyamangalam"
      />
    </div>
  )
}
// END REMOVABLE -- printed letterhead
