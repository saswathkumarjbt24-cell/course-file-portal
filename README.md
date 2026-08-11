# Course File Portal

A web application for preparing the **course file** that faculty maintain for every
course: student lists, periodical-test marks, CO attainment, remedial records,
internal marks and the final closing report — the work that is currently done by
hand across a 28-sheet spreadsheet workbook.

Every sheet of that workbook is a screen here, and the figures that used to be
copied between sheets are derived once and reused: a periodical-test total is
split into per-question marks through the institution's mark-split table, those
become per-CO percentages, those become CO attainment levels, and those roll up
into PO/PSO attainment.

> **Live demo:** to be added once GitHub Pages is enabled for this repository.

## Status: prototype

This is a **working prototype running entirely on mock data**. Nothing is saved.

- Every screen reads from `client/src/data/mockData.js` — invented students,
  courses and marks, not real institutional records.
- The frontend is **not connected to the backend**. Save buttons log their
  payload to the browser console and show a "Saved (mock)" message; reloading
  the page discards any edit.
- Sign-in is a name picker, not authentication. There is no password, token or
  session — see `client/src/context/`.
- Some rules are inferred from the source workbook rather than from documented
  regulations, and are marked as unconfirmed in code comments (for example how
  an optional test substitutes for an absent periodical test).

## Tech stack

| Part | Stack |
|---|---|
| Client | React 19, Vite 8, React Router 7, plain CSS with custom properties |
| Server | Node.js, Express (`server/index.js`), `mysql2` connection pool |
| Database | MySQL — schema in `server/db/migrations/*.sql`, run by hand |
| Lint | oxlint |
| Deployment | GitHub Actions → GitHub Pages (client only) |

No UI kit, no charting library, no state-management library. The distribution
bars on the Reports screen are plain `div`s.

## Repository layout

```
client/                 React + Vite app (port 5175)
  src/pages/            one component per course-file sheet
  src/components/       app shell and navigation
  src/utils/            CO split, attainment and internal-mark rules (pure functions)
  src/data/mockData.js  all mock data
server/                 Express API (port 5001)
  db/migrations/        SQL migrations, run manually
.github/workflows/      Pages deployment
```

## Running locally

Node.js 20 or newer is recommended (CI builds on Node 24).

### Client

```bash
cd client
npm install
npm run dev
```

Open <http://localhost:5175>. The port is pinned (`strictPort`), so the dev
server fails rather than silently moving if 5175 is taken.

Other client scripts:

```bash
npm run build      # production build into client/dist
npm run preview    # serve the production build
npm run lint       # oxlint
```

### Server

The client does not call the API yet, so the server is optional for a demo.

```bash
cd server
npm install
npm run dev        # nodemon index.js
```

It listens on port 5001 and exposes `GET /api/health`. Database credentials live
in `server/.env`, which is not committed.

### Database

Migrations are plain `.sql` files that you run yourself — there is no migration
runner. Create the `course_file_portal` database, then apply them in order:

```powershell
Get-Content .\server\db\migrations\001_course_natures_and_bands.sql -Raw | mysql -u YOUR_USER -p course_file_portal
```

Each file is safely re-runnable (`CREATE TABLE IF NOT EXISTS`, idempotent seeds).

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds `client/` and
publishes `client/dist` to GitHub Pages. Two things to know:

- `vite.config.js` sets `base: '/course-file-portal/'` to match the Pages URL.
- The app uses `HashRouter`, so deep links look like
  `.../course-file-portal/#/course/1/marks`. GitHub Pages has no server-side
  routing, and a path-based router would 404 on refresh.

Enable Pages under **Settings → Pages → Build and deployment → GitHub Actions**
for the first deployment to succeed.
