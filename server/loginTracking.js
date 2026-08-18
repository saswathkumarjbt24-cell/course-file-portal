// ---------------------------------------------------------------
// Recording a successful sign-in.
//
// Called from POST /api/auth/google, and from nowhere else. It runs AFTER
// Google has verified the person and after the faculty row has been found
// and checked -- it is not part of any decision, it only writes down what
// was decided elsewhere.
//
// THIS FILE CANNOT FAIL A SIGN-IN.
//   recordLogin never throws and never rejects. Every path through it is
//   inside one try/catch, so a missing table, a full disk, a lost database
//   connection or a bad column type ends as a console line and nothing
//   more. Somebody who has proved who they are gets their token whether or
//   not we managed to write the row.
//
// THE TOKEN IS NEVER SEEN HERE.
//   recordLogin is handed a faculty id and the request. It is not given the
//   Google ID token or the session token, so it cannot log either even by
//   accident, and the error path below prints only an error code and
//   message -- never a request body or a header.
// ---------------------------------------------------------------

const net = require("net");
const pool = require("./db");

/** login_events.user_agent is VARCHAR(255). */
const USER_AGENT_MAX = 255;

/**
 * Turn one raw address into a plain IP string, or null.
 *
 * Handles the three shapes these headers actually arrive in:
 *   - "::ffff:203.0.113.9"  an IPv4 address in IPv6 form, which is how Node
 *                           reports IPv4 on a dual-stack socket
 *   - "203.0.113.9:54321"   an address with the source port appended, which
 *                           some proxies write into X-Forwarded-For
 *   - "[2001:db8::1]:443"   the same, in the bracketed IPv6 form
 *
 * Anything that is not a valid IP address after that is dropped rather than
 * stored. The column is for addresses; a header full of junk is not one, and
 * writing it down would only make the table harder to believe later.
 */
function normaliseIp(raw) {
  if (typeof raw !== "string") return null;

  let ip = raw.trim();
  if (ip === "") return null;

  // "[2001:db8::1]:443" or "[2001:db8::1]" -> the part inside the brackets.
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];

  // "203.0.113.9:54321" -> "203.0.113.9". Only ever applied when there is
  // exactly one colon, so a bare IPv6 address is left alone.
  if (net.isIP(ip) === 0 && ip.indexOf(":") === ip.lastIndexOf(":")) {
    const withoutPort = /^([^:]+):\d+$/.exec(ip);
    if (withoutPort) ip = withoutPort[1];
  }

  // "::ffff:203.0.113.9" -> "203.0.113.9", so one visitor is not recorded
  // under two different spellings depending on how the socket was opened.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped && net.isIP(mapped[1]) === 4) ip = mapped[1];

  return net.isIP(ip) === 0 ? null : ip;
}

/**
 * Is this address one that can only belong to a machine on our own side of
 * the connection -- a reverse proxy, the loopback interface, a container
 * bridge -- rather than to a visitor out on the internet?
 *
 * Used for exactly one decision: whether a socket address is worth recording
 * when no forwarded-client header was present. See clientIpOf.
 */
function isLocalOrProxyAddress(ip) {
  const version = net.isIP(ip);

  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 127) return true;                     // 127.0.0.0/8 loopback
    if (parts[0] === 10) return true;                      // 10.0.0.0/8 private
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 link-local
    if (parts[0] === 0) return true;                       // 0.0.0.0/8 unspecified
    return false;
  }

  if (version === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;    // loopback / unspecified
    if (/^f[cd]/.test(lower)) return true;                 // fc00::/7 unique-local
    if (/^fe[89ab]/.test(lower)) return true;              // fe80::/10 link-local
    return false;
  }

  return false;
}

/**
 * The visitor's IP address, or null when we do not honestly have one.
 *
 * NULL IS A REAL, EXPECTED ANSWER, AND IT IS THE POINT OF THIS FUNCTION.
 *   The site sits behind Cloudflare, and the API sits behind Nginx. By the
 *   time a request reaches Node the socket's peer address is a proxy's --
 *   Cloudflare's edge, or 127.0.0.1 where Nginx is on the same box. Writing
 *   that into login_events.ip would fill the column with the addresses of
 *   our own infrastructure, all identical, and read for the rest of the
 *   table's life as though every member of staff signed in from one place.
 *   A NULL that means "not known" is worth more than a value that is known
 *   to be wrong.
 *
 * Preference order:
 *   1. CF-Connecting-IP  - Cloudflare sets this to the original visitor and
 *      strips any copy the client sent, so behind Cloudflare it is the one
 *      to trust.
 *   2. the FIRST entry of X-Forwarded-For - the list reads left to right
 *      from the client through each proxy, so the leftmost is the visitor.
 *      It is also the only entry a client can forge, which is the trade
 *      being made: this is a usage log, not an access control, and nothing
 *      is authorised on the strength of it. See the caveat below.
 *   3. the socket address - used ONLY when it is a public address, which
 *      means nothing proxied this request and it really is the visitor's
 *      (a developer hitting the API directly, say). A loopback or private
 *      address at this point is a proxy hop, never a person, so it is
 *      dropped and this function returns null.
 *
 * CAVEAT, RECORDED HERE ON PURPOSE. Both headers are only as good as the
 * proxy in front of Node. If Nginx does not overwrite them, and Node is ever
 * reachable other than through it, a caller can put whatever it likes in
 * either one. Treat this column as "what the request claimed", not as proof
 * of where somebody was.
 */
function clientIpOf(req) {
  const headers = (req && req.headers) || {};

  const cloudflare = normaliseIp(headers["cf-connecting-ip"]);
  if (cloudflare) return cloudflare;

  const forwardedFor = headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor !== "") {
    const first = normaliseIp(forwardedFor.split(",")[0]);
    if (first) return first;
  }

  const socketAddress = normaliseIp(
    (req && req.socket && req.socket.remoteAddress) || null
  );
  if (socketAddress && !isLocalOrProxyAddress(socketAddress)) return socketAddress;

  // Nothing trustworthy. Deliberately null rather than a proxy's address.
  return null;
}

/**
 * The browser's self-reported User-Agent, truncated to what the column
 * holds, or null.
 *
 * TRUNCATED, NOT REJECTED. An over-long agent string is a browser being
 * verbose, not an error, and the first 255 characters are enough to tell a
 * phone from a lab machine -- which is all this field is for. Rejecting it
 * would lose the whole row's usefulness over a detail nobody reads.
 *
 * Length is capped here rather than left to MySQL so the INSERT cannot fail
 * on a truncation error in strict mode.
 */
function userAgentOf(req) {
  const raw = req && req.headers ? req.headers["user-agent"] : null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, USER_AGENT_MAX);
}

/**
 * Write down one successful sign-in: stamp faculty.last_login_at, and append
 * a login_events row.
 *
 * NEVER THROWS, NEVER REJECTS. That is this function's contract and the
 * reason the caller can await it without a try/catch of its own.
 *
 * Both timestamps come from the database's NOW() rather than from a JS Date,
 * so the two statements agree with each other and with the DEFAULT on
 * login_events.occurred_at, whatever time zone the Node process happens to
 * run in.
 *
 * `updated_at = updated_at` on the UPDATE is load-bearing: faculty.updated_at
 * is ON UPDATE CURRENT_TIMESTAMP, and signing in is not an edit of somebody's
 * staff record. Assigning the column its own value holds it still.
 *
 * The two writes are not wrapped in a transaction, deliberately. They are
 * independent notes about the same event, neither is read by any decision the
 * app makes, and one of them landing alone is strictly better than a rollback
 * that records nothing.
 */
async function recordLogin(facultyId, req) {
  try {
    await pool.execute(
      `UPDATE faculty
          SET last_login_at = NOW(),
              updated_at    = updated_at
        WHERE id = ?`,
      [facultyId]
    );

    await pool.execute(
      `INSERT INTO login_events (faculty_id, occurred_at, ip, user_agent)
       VALUES (?, NOW(), ?, ?)`,
      [facultyId, clientIpOf(req), userAgentOf(req)]
    );
  } catch (err) {
    // Swallowed on purpose. Only the code and message are printed -- never
    // the error object, which mysql2 can attach the failing statement to,
    // and never anything off the request.
    console.error(
      "Login tracking failed; sign-in was not affected:",
      (err && (err.code || err.message)) || "unknown error"
    );
  }
}

module.exports = { recordLogin, clientIpOf, userAgentOf, normaliseIp };
