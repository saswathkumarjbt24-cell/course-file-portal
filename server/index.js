const express = require("express");
const cors = require("cors");
require("dotenv").config();
const pool = require("./db");
const { requireAuth } = require("./auth");

const facultyRoutes = require("./routes/faculty");
const courseRoutes = require("./routes/courses");
const assessmentRoutes = require("./routes/assessments");
const referenceRoutes = require("./routes/reference");
const reportRoutes = require("./routes/reports");
const studentRoutes = require("./routes/students");
const authRoutes = require("./routes/auth");

const app = express();
app.use(cors({ origin: "http://localhost:5175" }));
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DATABASE() AS db, NOW() AS now");
    res.json({ ok: true, db: rows[0].db, time: rows[0].now });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------
// THE THREE OPEN ENDPOINTS, AND NOTHING ELSE.
//
// GET /api/health is above. authRoutes holds GET /api/auth/config and POST
// /api/auth/google, which have to be reachable by definition -- they are how
// you get a token in the first place. Both are mounted BEFORE the gate below.
//
// Sign-in verification carries the only POST in the app; everything else
// reads or replaces a sheet with PUT.
// ---------------------------------------------------------------------
app.use("/api/auth", authRoutes);

// ---------------------------------------------------------------------
// THE GATE. Everything mounted after this line needs a valid session token.
//
// Deliberately ONE app.use on the /api prefix rather than requireAuth listed
// on each router: a route added later is protected by default, and protecting
// it is not something anybody has to remember. Fail closed.
//
// It also means an unknown /api path answers 401 rather than the 404 below
// when there is no token, so the route list cannot be enumerated anonymously.
//
// CORS preflights never reach it -- the cors middleware above answers OPTIONS
// itself, which it must, because a browser sends no Authorization header on a
// preflight.
// ---------------------------------------------------------------------
app.use("/api", requireAuth);

// ---------------------------------------------------------------------
// API routes. Reads are GET; saves are PUT. There is no POST or DELETE
// anywhere -- every write in this app replaces a whole sheet at a known
// address, which is exactly what PUT means.
//
// Authentication is settled by the gate above. What each router adds on top
// is AUTHORISATION: which courses, which department, which role.
// ---------------------------------------------------------------------
app.use("/api/faculty", facultyRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/assessments", assessmentRoutes);
app.use("/api/reference", referenceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/students", studentRoutes);

// ---------------------------------------------------------------------
// Unknown /api path -> JSON 404, so the frontend never has to parse an HTML
// error page.
// ---------------------------------------------------------------------
app.use("/api", (req, res) => {
  res.status(404).json({
    error: "Not found",
    message: `No route for ${req.method} ${req.originalUrl}`,
  });
});

// ---------------------------------------------------------------------
// Error middleware. Anything a handler throws or rejects with lands here, so
// a database failure is a 500 with a JSON body rather than a dead process.
// A ValidationError additionally carries `issues`, the list of offending rows
// -- when one is thrown the transaction has already rolled back and nothing
// was saved.
//
// Must be registered last, and must take four arguments for Express to treat
// it as an error handler.
// ---------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  const body = {
    error: status === 500 ? "Internal server error" : err.message,
    message: err.message,
  };
  if (Array.isArray(err.issues)) body.issues = err.issues;

  res.status(status).json(body);
});

// Last-resort net: an unhandled rejection terminates the process from Node 15
// on. Handlers are wrapped in asyncHandler so this should never fire, but if
// one is ever added without the wrapper the server logs instead of dying.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log("Server listening on http://localhost:" + PORT));
