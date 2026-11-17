# CNHS Platform

Calape National High School: the public website + publications, a Node.js backend, and three Flutter apps. This replaces the PHP portal.

| Part | Folder | Runs on |
|---|---|---|
| Website, publications, API, realtime socket | `backend/` | Render (one web service) |
| Database + article pictures | Supabase (Postgres + Storage) | Supabase |
| Staff / admin app | `apps/admin` | **Windows** |
| Teacher app | `apps/teacher` | **Android + Windows** |
| Student app | `apps/student` | **Android** |
| Shared UI, API client, realtime, notifications | `packages/cnhs_core` | all apps |

All three apps use the same warm-paper design, the same side menu / tabs / panels, and the same features as the web portal.

## How realtime and phone notifications work (no Firebase)
* Every signed-in app keeps one WebSocket open to your backend. When something happens (grades released, absence marked, announcement, notice, new publication, schedule change, new class assigned...) the server saves a notification and pushes it down the socket.
* **Android:** a small foreground service holds the socket open (also after the phone restarts) and raises the system notification itself. Android shows a quiet permanent "Connected for school updates" notification while it runs; that is the price of not using Google's push.
* **Windows:** the app shows a toast while it is running.
* If a phone was offline, it catches up on missed notifications when it reconnects. Open screens also refresh themselves live (e.g. a teacher saves grades, the student's grade list updates).
* Each person also has a bell inside the app with the full notification list.

## Deploy (about 30 minutes)

### 1. Supabase
1. Create a project. Remember the database password.
2. **Project Settings > Database > Connection string > Session pooler**: copy it (this is `DATABASE_URL`; the direct connection is IPv6-only and fails on Render).
3. **Project Settings > API**: copy the project URL (`SUPABASE_URL`) and the `service_role` key (`SUPABASE_SERVICE_KEY`). Keep that key secret.
4. Nothing else to do: the backend creates the tables on first start and creates the public `pub-media` bucket for article pictures.

### 2. GitHub
Push this folder to a new GitHub repository.

### 3. Render
1. **New > Blueprint**, choose the repository. Render reads `render.yaml`.
2. Fill in: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SITE_URL` (the Render address, e.g. `https://cnhs-portal.onrender.com`), `APP_DOWNLOAD_URL` (your repo's `/releases/latest` page). `JWT_SECRET` is generated for you.
3. Deploy. The website is now at your Render address (`/` and `/publications`); the API is under `/api/v1`.
4. Create the first administrator (replaces the old setup page). In the Render service > **Shell**:
   ```
   ADMIN_USER=admin ADMIN_NAME="Your Name" ADMIN_PASS='a-long-Strong#Password1' npm run create-admin
   ```
   Then add the school year, teachers, subjects and sections from the staff app.

> **Plan:** `free` sleeps after about 15 minutes without traffic, which stops live push to idle phones. For real use choose `starter` (set in `render.yaml`).

### 4. Build the apps on GitHub
1. Repo **Settings > Secrets and variables > Actions > Variables**: add `API_BASE` = your Render address.
2. Push a tag: `git tag v1.0.0 && git push --tags`. The **Build apps** workflow builds:
   * `cnhs-admin-windows.zip` (staff)
   * `cnhs-teacher-android.apk` and `cnhs-teacher-windows.zip`
   * `cnhs-student-android.apk`
   and attaches them to the GitHub Release. You can also run it by hand from the Actions tab.
3. Install: unzip the Windows builds and run the `.exe`; on Android allow "install unknown apps" and open the `.apk`. On first run allow notifications. (The server address can also be changed on the sign-in screen under "Server address".)

APKs are signed with the debug key. That installs fine; for Play Store publishing you would add your own signing key.

## Local development
```
cd backend && cp .env.example .env && npm install
npm run migrate && npm run create-admin && npm start
BASE=http://localhost:3000 npm test        # end-to-end tests
```
Apps: install Flutter 3.27+, then from the repo root `tools/prepare_app.sh student android "CNHS Student"` (creates the platform folders and patches them), then `cd apps/student && flutter run --dart-define=API_BASE=http://10.0.2.2:3000`.

## Behaviour changes from the PHP portal (deliberate)
* Sessions: Windows keeps the old rules (20 min idle, 8 h max). Phones stay signed in for up to 30 days idle / 90 days, otherwise background notifications could not work. Admin can end a person's sessions by resetting their password or disabling the account.
* Publications now live in the same database (the old second MySQL database existed only because of hosting limits). Pictures are stored in Supabase Storage because Render's disk is wiped on every deploy.
* The web portals (admin/teacher/student pages) are gone; the website shows "Get the apps" instead of portal sign-in buttons.
* Existing PHP password hashes (bcrypt) still work, so imported accounts can sign in.
* Extra: Row Level Security is enabled on every table with no policies, so Supabase's public "anon" key cannot read school data; only the backend can.

## Not included
* Importing your old MySQL data. The schema maps 1:1 (see `backend/migrations/001_init.sql`), but I had no data to test an importer against. After importing, run **System > ID migration** in the staff app.
* Windows tray / background mode: Windows toasts appear while the app is open.
