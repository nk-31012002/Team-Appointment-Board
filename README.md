# Team Appointment Board

A small full-stack app for scheduling, tracking, and managing team appointments. Built with a **FastAPI + SQLite** backend and a **React + Vite + Tailwind** frontend.

## What it does

- Displays all appointments as a card board
- Lets you add, edit, complete, and cancel appointments
- Filters the board by date and/or status
- Blocks two appointments from overlapping on the same day
- Shows success/error messages for every action
- Comes pre-loaded with sample appointments so it can be reviewed immediately

## How it works

**Backend (`server/main.py`)**
A FastAPI service backed by a SQLite database (`appointments.db`, created automatically on first run). It exposes four endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/appointments?date=&status=` | List appointments, optionally filtered by date and/or status |
| `POST` | `/api/appointments` | Create a new appointment |
| `PUT` | `/api/appointments/{id}` | Edit an existing appointment |
| `PATCH` | `/api/appointments/{id}/status` | Mark an appointment as `Completed` or `Cancelled` |

On startup, if the database is empty, four sample appointments are seeded automatically (a mix of Scheduled, Completed, and Cancelled) so the board is populated the first time it's opened.

**Double-booking prevention:** when an appointment is created or edited, the backend checks every *other active* (non-cancelled) appointment on the same date for a time overlap (`existing.start < new.end AND existing.end > new.start`). If any overlap is found, the request is rejected with a `409` error and a clear message. Cancelled appointments never block a new time slot, since the slot they occupied is effectively freed up.

**Frontend (`client/`)**
A single-page React app that fetches the appointment list on load and whenever the date/status filters change. Adding or editing an appointment opens a modal form; submitting it calls the appropriate backend endpoint and refreshes the board. Every action (success or failure) shows a dismissible banner using the message returned by the API, so validation errors (missing fields, bad time range, time-slot conflict) are always visible to the user.

## Assumptions made

- **Only `Scheduled` appointments can be edited or have their status changed.** Once an appointment is `Completed` or `Cancelled`, it's treated as final/locked — the board shows "No further actions permitted" instead of action buttons. This keeps the history of what happened accurate (e.g. you can't "un-cancel" or edit a cancelled slot back into existence).
- **Description is optional**; title, date, start time, and end time are required, per the task's "required information" check.
- **Cancelled appointments stay visible on the board** (not deleted), shown with reduced opacity and a "Cancelled" badge, so the team retains a record of what was scheduled and later cancelled.
- **Time overlap is exclusive at the boundary** — an appointment ending at 11:00 and another starting at 11:00 are *not* considered a conflict, so back-to-back bookings are allowed.
- **A single shared board** (no per-user accounts) — appropriate for a small team tool as described in the brief.
- The status filter's `"All"` option means "no status filter applied" and isn't a real status value.

## Running the project

### Backend

```bash
cd server
python -m venv venv
source venv/bin/activate   # on Windows: venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy pydantic
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`, and interactive docs at `http://localhost:8000/docs`.

> Note: `server/package.json` is a leftover Node scaffold file and is not used — the backend is Python/FastAPI only. It's safe to delete, or replace with a `requirements.txt` containing:
> ```
> fastapi
> uvicorn
> sqlalchemy
> pydantic
> ```

### Frontend

```bash
cd client
npm install
npm run dev
```

The app will be available at `http://localhost:5173` (Vite's default) and expects the backend to be running at `http://localhost:8000`.
