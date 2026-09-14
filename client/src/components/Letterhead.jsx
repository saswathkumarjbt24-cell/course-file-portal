// BEGIN REMOVABLE -- printed letterhead
import letterheadImage from '../assets/letterhead.jpg'
import './Letterhead.css'

/* ---------------------------------------------------------------
   The official college letterhead band -- logo, institution name,
   accreditation line, address, phone, fax, email and web address,
   all inside the one image the department's own Excel uses.

   PRINT ONLY. On screen every sheet keeps the typed heading it has
   always had; this renders nothing there. A sheet that carries a typed
   institution heading marks that heading with `letterhead-replaced`,
   which the stylesheet hides in print, so the name and address are
   never set twice on the same sheet.

   ONE DEFINITION. No screen carries its own copy of this markup.
   --------------------------------------------------------------- */

export default function Letterhead() {
  return (
    <div className="letterhead">
      {/* The intrinsic 2134x376 is stated so the aspect ratio is known
          before the image decodes; the stylesheet scales it by width
          alone, so it is never stretched and never cropped.
          An <img>, not a CSS background: browsers drop background
          images when printing. alt is empty because on screen this is
          hidden and the same words are in the typed heading beside it. */}
      <img
        className="letterhead__img"
        src={letterheadImage}
        width="2134"
        height="376"
        alt=""
      />
    </div>
  )
}
// END REMOVABLE -- printed letterhead
