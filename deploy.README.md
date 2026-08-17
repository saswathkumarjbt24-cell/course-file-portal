# Deploying the course file portal

`deploy.sh` runs **on the server**, from the repo root. It replaces building on a
laptop and copying `dist/` up by hand.

```
cd /opt/course-file-portal
./deploy.sh
```

That is the whole routine. It is safe to re-run — every step either checks first
or is idempotent.

---

## What it does

Twelve steps, each with a heading in the output. It stops at the first problem,
and every check that can fail happens **before** anything on the live system is
touched.

| # | Step | Stops the deploy when |
|---|---|---|
| 0 | Preflight — `git npm node mysql curl pm2` on `PATH`, the pm2 app exists for **this** user, `/var/www` is writable | a tool is missing, pm2 has no such app, or `/var/www` is not writable |
| a | Checkout is on `main` | it is on any other branch |
| b | `client/.env.production` exists and sets all three build variables | the file is missing, or a variable is absent or empty |
| c | `server/.env` exists, and carries `DB_*` and `JWT_SECRET` | the file is missing, or `DB_USER` / `DB_NAME` / `JWT_SECRET` is unset |
| d | `git pull --ff-only` | the pull is not a fast-forward |
| e | `npm ci --omit=dev` in `server/` | the install fails |
| f | `npm ci` in `client/` (dev deps included — vite is one) | the install fails |
| g | every `server/db/migrations/*.sql`, in filename order | the database is unreachable, or **any** file fails — it names the file |
| h | `npm run build -- --base=/` | the build fails or produces no `index.html` |
| i | greps the built bundle for the `VITE_API_URL` value | the value is not in the bundle |
| j | moves the live bundle to `/var/www/course-file.prev`, publishes the new one | the copy or the rename fails |
| k | `pm2 reload course-file-api` | pm2 refuses |
| l | `GET /api/health` must be **200**, `GET /api/faculty` **401** | either is wrong — it prints both and tells you how to roll back |

Two of those are worth explaining.

**Step i exists because the alternative failure is silent.** The frontend decides
at *build* time whether it talks to an API: `client/src/data/api.js` switches to
sample-data mode when `VITE_API_URL` is unset. A build that missed the variable
does not error — it produces a site that looks fine, shows sample data, and can
sign nobody in. So the value is grepped out of the built bundle, and a build
without it is thrown away before it can reach `/var/www`.

**Step l checks `/api/faculty` returns 401, not just that the API is up.** A 200
there would mean authentication is not being enforced and staff email addresses
are readable by anyone on the internet. The script calls that out as urgent.

### Order of operations

The API keeps serving the whole time until step k. `npm ci` in step e replaces
`server/node_modules` while the old process is still running, which is fine —
Node has already loaded its modules into memory. Nothing about the live site
changes until step j, so a failure anywhere in steps 0–i leaves production
exactly as it was.

---

## One-time setup on the server

### 1. Make the script executable

It arrives via `git pull`, and git only tracks the executable bit if it was set
when the file was committed. Once, on the server:

```
cd /opt/course-file-portal
chmod +x deploy.sh
```

(If you would rather not rely on the bit at all: `bash deploy.sh` works too.)

### 2. Create `client/.env.production`

This file is **gitignored and must never be committed** — it carries the Google
client id. Write it on the server:

```
cd /opt/course-file-portal/client
cat > .env.production <<'EOF'
VITE_API_URL=https://<the public https origin of the API>
VITE_GOOGLE_CLIENT_ID=<the Google OAuth client id for this app>
VITE_ALLOW_DEMO_LOGIN=false
EOF
chmod 600 .env.production
```

- **`VITE_API_URL`** — origin only, no trailing slash and no `/api` suffix. The
  data layer appends `/api/...` itself, so a trailing slash produces `//api/...`.
- **`VITE_GOOGLE_CLIENT_ID`** — must be the *same* client id as
  `GOOGLE_CLIENT_ID` in `server/.env`. If they differ, every sign-in fails
  verification: the server rejects a token that was not minted for its own
  client id.
- **`VITE_ALLOW_DEMO_LOGIN`** — `false`. The faculty picker also requires
  `VITE_API_URL` to be *unset*, so it cannot appear in this build either way, but
  the script warns if it finds `true` because it means the file was copied from
  the demo config.

The filename matters. Vite only loads `.env.production` for a production build —
`.env.prod`, `.env.production.local` copied wrong, or `.env` will not be picked
up, and step i will catch it.

### 3. Check `server/.env`

Should already exist. It must carry `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME`, `GOOGLE_CLIENT_ID`, `ALLOWED_EMAIL_DOMAIN` and
`JWT_SECRET`. See `server/.env.example` for the full annotated list, and generate
`JWT_SECRET` with the command that file gives.

The script reads `DB_*` from here to run the migrations and refuses to start if
`JWT_SECRET` is missing — the API will not boot without it, so reloading pm2
would take the site down.

### 4. Know which user to run as

Run it as **the user that owns the pm2 daemon running the API**, and that can
write `/var/www`.

`pm2` is per-user. Running the script under `sudo` when pm2 belongs to somebody
else would reload a different, empty daemon, report success, and leave the old
code serving. The script therefore never calls `sudo` itself; it checks both
things in step 0 and stops with a clear message rather than guessing. Check who
owns the process with `pm2 list`.

---

## Rolling back

Step j leaves the release you just replaced at `/var/www/course-file.prev`. It is
a complete directory, not a diff.

**Frontend:**

```
rm -rf /var/www/course-file.broken
mv /var/www/course-file      /var/www/course-file.broken
mv /var/www/course-file.prev /var/www/course-file
```

No Nginx reload is needed — it serves from the path, and the two renames take
milliseconds. Keeping the bad build at `.broken` means you can still look at it;
delete it when you are done.

Note that this restores **one** release only. `.prev` is overwritten by every
deploy, so roll back before deploying again.

**API:** the API is not backed up by this script, because it does not need to be
— it runs from the git checkout. Roll it back with git and reload:

```
cd /opt/course-file-portal
git log --oneline -5          # find the commit you want
git checkout <commit>         # or: git reset --hard <commit>
npm --prefix server ci --omit=dev
pm2 reload course-file-api
```

Then confirm, exactly as step l does:

```
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5001/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5001/api/faculty  # 401
```

Remember to `git checkout main` before the next `./deploy.sh`, or step a will
refuse to run.

**Database:** migrations are **not** rolled back, by this script or otherwise.
They are all additive and guarded, so a re-deploy of older code keeps working
against a newer schema. Nothing here drops a column or a table.

---

## Two things to watch

**If a pull updates `deploy.sh` itself**, the script stops before doing anything
and asks you to run it again. bash reads a script as it executes, so continuing
would run a mixture of the old and new file. Nothing has changed at that point —
just run `./deploy.sh` a second time.

**Migrations `007_seed_sample_data.sql`, `009_seed_documents.sql` and
`011_seed_internal_marks.sql` are test seeds.** The header of
`006_faculty_and_allocations.sql` says they are "skipped in a production
install". By default this script runs *every* migration, which is correct for the
current server — the seeds are already applied there and re-running them is a
no-op. On a **fresh** production database they would insert sample staff,
students and marks. Skip them explicitly that once:

```
SKIP_MIGRATIONS="007_seed_sample_data.sql 009_seed_documents.sql 011_seed_internal_marks.sql" ./deploy.sh
```

The variable is read from the environment and never edited into the script.

---

## No secrets in this repo

Neither `deploy.sh` nor this file contains a password, a client id, a hostname or
a token. The database password, the API origin and the Google client id are all
read at run time from `client/.env.production` and `server/.env`, both of which
are gitignored.

The script does not print any of them. The database password is handed to `mysql`
through a mode-600 option file that is deleted when the script exits, however it
exits — never as a command-line argument, which every user on the box could read
out of `ps`.
