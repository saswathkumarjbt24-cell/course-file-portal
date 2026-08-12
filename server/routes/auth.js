// ---------------------------------------------------------------
// Routes mounted at /api/auth
//
//   GET  /api/auth/config - is Google sign-in configured on this server?
//   POST /api/auth/google - verify a Google ID token and return the faculty
//
// THE BROWSER DECIDES NOTHING.
//   The frontend passes Google's ID token through untouched and never decodes
//   it. Every check that matters -- signature, audience, issuer, expiry,
//   verified email, allowed domain, and whether the person is on staff --
//   happens here.
//
// THE TOKEN IS NEVER LOGGED.
//   Not on success, not on failure, not in an error message. A verification
//   failure returns a fixed sentence with nothing from the token in it.
//
// NO ACCOUNT IS EVER CREATED.
//   A valid Google account in the right domain that has no `faculty` row is
//   rejected. Staff records are institutional data; signing in does not
//   create one.
// ---------------------------------------------------------------

const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const pool = require("../db");
const { asyncHandler, HttpError, isPlainObject } = require("../helpers");

const router = express.Router();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || "").trim().toLowerCase();

// Built once. Absent when the server has no client id, which is how
// /config reports "not configured" rather than failing at sign-in time.
const client = CLIENT_ID ? new OAuth2Client(CLIENT_ID) : null;
const CONFIGURED = Boolean(client && ALLOWED_DOMAIN);

/**
 * The domain of an email address: everything after the LAST '@', lowercased.
 *
 * The last '@' matters. A local part may legally contain a quoted '@', so
 * splitting on the first one would let "a@bitsathy.ac.in"@evil.com read as
 * the allowed domain.
 */
function domainOf(email) {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain === "" ? null : domain;
}

// ---------------------------------------------------------------------
// GET /api/auth/config
//
// Lets the sign-in page tell "this server cannot do Google sign-in at all"
// apart from "Google rejected you" or "you are not on staff". Without it a
// missing server-side client id looks identical to a bad account.
//
// Returns no secret: the allowed domain is printed on the sign-in page
// anyway, and the client id is not echoed -- the frontend already has its own.
// ---------------------------------------------------------------------
router.get(
  "/config",
  asyncHandler(async (req, res) => {
    res.json({
      googleConfigured: CONFIGURED,
      allowedEmailDomain: ALLOWED_DOMAIN || null,
    });
  })
);

// ---------------------------------------------------------------------
// POST /api/auth/google
//
// Body: { credential } -- the ID token from Google Identity Services.
//
// Failure modes, deliberately distinct:
//   503  this server has no Google configuration
//   400  the body is not shaped like a credential
//   401  the token did not verify, or its email is unverified
//   403  verified, but the wrong domain, or not on staff, or not active
// ---------------------------------------------------------------------
router.post(
  "/google",
  asyncHandler(async (req, res) => {
    if (!CONFIGURED) {
      throw new HttpError(
        503,
        "Google sign-in is not configured on this server"
      );
    }

    const body = req.body;
    if (
      !isPlainObject(body) ||
      typeof body.credential !== "string" ||
      body.credential.trim() === ""
    ) {
      throw new HttpError(400, 'Body must be { "credential": "<Google ID token>" }');
    }

    // Verifies signature against Google's published keys, and that the token
    // was issued FOR this client id, BY Google, and has not expired.
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: body.credential,
        audience: CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      // The caught error can quote the token. It is deliberately dropped:
      // nothing derived from it is logged or returned.
      throw new HttpError(401, "Google sign-in could not be verified");
    }

    if (!payload) {
      throw new HttpError(401, "Google sign-in could not be verified");
    }

    // A Google account can carry an address it never proved it owns.
    if (payload.email_verified !== true) {
      throw new HttpError(
        401,
        "That Google account has not verified its email address"
      );
    }

    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const domain = domainOf(email);

    // Checked against the verified `email` claim, NOT the `hd` claim. `hd` is
    // a hint the account chooser uses; it is not a security control.
    if (domain === null || domain !== ALLOWED_DOMAIN) {
      throw new HttpError(403, `Sign in with your @${ALLOWED_DOMAIN} account`);
    }

    // Looked up WITHOUT the is_active filter, so an account that exists but
    // has been deactivated gets an accurate message instead of being told it
    // was never registered. Both are 403 and neither grants access.
    const [rows] = await pool.execute(
      `SELECT id, name, email, department, designation, is_active
         FROM faculty
        WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      throw new HttpError(
        403,
        "That account is not registered as faculty. Ask the department to add it."
      );
    }

    const row = rows[0];
    if (!row.is_active) {
      throw new HttpError(403, "That faculty account is no longer active");
    }

    // Exactly the shape /api/faculty returns, so the session stores the same
    // object whichever way the user signed in and nothing downstream changes.
    res.json({
      id: row.id,
      name: row.name,
      email: row.email,
      department: row.department,
      designation: row.designation,
    });
  })
);

module.exports = router;
