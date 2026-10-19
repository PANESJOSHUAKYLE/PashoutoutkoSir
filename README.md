# COT Event Attendance Monitoring System

A secure event-attendance system for the College of Technologies. The application is intentionally limited to **student and faculty event attendance**.

## Implemented workflow

- Server-assigned Student, Faculty, and Administrator roles.
- ID/username and password login backed by Django sessions and CSRF protection.
- Upcoming, ongoing, and completed event visibility with date, time, and venue.
- Student event registration with server-side duplicate protection.
- QR, barcode, and RFID/ID event check-in flows.
- Server-generated Present/Late status and confirmation only after persistence.
- Personal event history and attendance percentage.
- Faculty monitoring and PDF export limited to assigned events.
- Student and faculty profile updates with protected role and identity fields.
- Event feedback after attendance, with one response per user and event.
- Optional organizer-issued student participation certificates.

Administrator functionality remains in a separate workspace and is never exposed through student or faculty API permissions.

## Technology

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, QR Scanner, jsPDF.
- Backend: Django 6, Django REST Framework, SQLite by default.
- Authentication: Django server sessions, CSRF, HttpOnly session cookie.

## Requirements

- Python 3.12 or newer
- Node.js 20 or newer

## Start locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_event_demo --reset
python manage.py runserver
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://127.0.0.1:8000`. The development server is configured to use port 5173 strictly; if that port is already occupied, stop the existing frontend process rather than opening the fallback port, because only the documented local origins are trusted for CSRF.

## Google sign-in setup

1. In Google Cloud Console, create an OAuth client ID with application type **Web application**.
2. Add `http://localhost:5173` and `http://127.0.0.1:5173` as authorized JavaScript origins for local development.
3. Put the client ID in the project `.env` file as `GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com`.
4. Install backend requirements, run `python manage.py migrate`, and restart Django.
5. Sign in as an administrator, open **Settings → Integrations**, and turn on **Use Google account to sign in**.

The client ID is public and is sent to the browser; do not put a client secret in frontend code. Google sign-up requests still need administrator approval. Existing accounts can link on their first Google sign-in only when the Google verified email matches the account email. The backend verifies each Google ID token before using its identity claims.

## Password recovery email

In development, Django prints password recovery emails to the backend console (or `backend-server.log` when started with `start-app.ps1`). To deliver reset links by email, configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS` (set to `1` when required), and `DEFAULT_FROM_EMAIL` in the root `.env`. Set `FRONTEND_BASE_URL` to the public frontend URL. Reset links expire after one hour, and new passwords must be at least 12 characters with at least three character groups.

## Event map setup

The administrator event editor includes a map picker centered on Bukidnon State University's main campus. Set a pin by clicking the map or dragging it, then save the event; its event card displays the saved location below attendance and late cut-off. Latitude and longitude can also be entered manually.

Google Maps uses a separate API key from the Google sign-in client ID:

1. In Google Cloud Console, create a Maps API key and enable **Maps JavaScript API** and **Maps Embed API** for the project. Google Maps may require billing to be enabled.
2. Restrict the key to your website origins (for local development, `http://localhost:5173` and `http://127.0.0.1:5173`) and to the Maps APIs this feature uses.
3. Put the key in `frontend/.env.local` as `VITE_GOOGLE_MAPS_API_KEY=your-maps-api-key`.
4. Restart Vite. Do not put this key in the root `.env` as `GOOGLE_CLIENT_ID`; that value is only for Google sign-in.

The key is used by the browser, so restrict it in Google Cloud Console. Without it, admins can still enter coordinates manually and open the location in Google Maps, but embedded maps and the click-to-place picker are unavailable.

The VS Code **Run Attendance App** task runs both processes. If Python is not installed or the Microsoft Store alias is being used, install Python and reopen VS Code.

## Development accounts

`seed_event_demo` creates relative-date event data for testing:

| Role | ID | Default development password |
| --- | --- | --- |
| Student | `STU001` | `student123` |
| Faculty | `FAC001` | `faculty123` |
| Administrator | `ADM001` | `admin123` |

Override `DEMO_STUDENT_PASSWORD` and `DEMO_FACULTY_PASSWORD` before seeding when needed. These credentials are for local development only; do not use the seed command in production.

## Event API

- `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`
- `GET/PATCH /api/profile/`
- `GET /api/events/`
- `GET /api/events/managed/` (Faculty, assigned events only)
- `POST /api/events/<id>/registrations/` (Student)
- `POST /api/events/<id>/check-in-code/` (assigned Faculty, QR)
- `POST /api/attendance/scan/`
- `GET /api/attendance/me/`
- `GET /api/events/<id>/attendance/` (assigned Faculty)
- `POST /api/events/<id>/feedback/`
- `GET /api/reports/me.pdf`
- `GET /api/reports/events/<id>.pdf` (assigned Faculty)
- `GET /api/certificates/<id>/download/` (owning Student)

## Data model

`UserProfile` is linked to Django's authenticated user. `Event` owns event-scoped `EventRegistration`, `EventAttendance`, `EventFeedback`, `EventCertificate`, and short-lived `AttendanceCode` records. Database constraints enforce one registration, attendance row, feedback response, and certificate per user and event.

## Security checks

The server, rather than the browser, validates the assigned role, event audience, registration prerequisite, check-in window, event method, own card identity, faculty assignment, and duplicate attendance. Profile updates explicitly reject role, ID, department assignment, and card-assignment changes. Personal reports and history have no user-selection parameter.

## Verification

```powershell
python manage.py test events
cd frontend
npm run lint
npm run build
```

The repository includes API tests for role isolation, owner-only history, duplicate scans, self-only card matching, protected roles, authorized faculty monitoring/export, feedback gating, and certificate ownership.
