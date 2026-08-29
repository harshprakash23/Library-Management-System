# Library Seat Management System

A deployable Node.js app for a real library workflow:

- Students open one website link and only view seat status
- Librarians open the same website, choose the librarian option, and log in
- You keep super admin access for setup and maintenance

## Included Views

- `Home`: choose `Student` or `Librarian`
- `Student`: public seat map with live vacant, occupied, and floating status
- `Librarian`: username login, search seats, mark seats vacant/occupied/floating, view activity, and reset all seats using the reset key
- `Super Admin`: hidden management panel for librarian accounts, library name/logo, and librarian reset key

Librarians can also select **Download Daily Report** to save an Excel-compatible
CSV snapshot of all seats, their current status, and the report summary. Keep
these reports as a simple daily record; they do not replace a PostgreSQL backup.

## Database Storage

The app stores data in a PostgreSQL database:

- Environment variable: `DATABASE_URL` (e.g. `postgres://postgres:postgres@localhost:5432/library_db`) or individual `PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT` settings.
- Stored data:
  - librarian and super admin accounts
  - seat statuses (`VACANT`, `OCCUPIED`, or `FLOATING`)
  - library settings
  - activity logs

The server will not start if it cannot reach PostgreSQL. This protects seat
statuses from being replaced with a blank, in-memory database after a restart.
For a disposable local UI demo without PostgreSQL, explicitly set
`ALLOW_IN_MEMORY_DB=true`; all data, including seat statuses, is then lost when
the server restarts.

On Render, keep the `library-db` PostgreSQL database attached to the web
service through `DATABASE_URL`. Do not set `ALLOW_IN_MEMORY_DB` in Render. A
free web service can sleep or restart; PostgreSQL persists the seat statuses
through those events. The `/healthz` check only reports healthy after it can
read all 61 persistent seat records.

## Tech Stack

- Node.js
- Express
- PostgreSQL (`pg`)
- JWT authentication
- BCrypt password hashing

## Demo Credentials

- Librarian
  - Username: `librarian`
  - Password: `Admin1234`
- Super Admin
  - Email: `superadmin@library.local`
  - Password: `SuperAdmin123`
- Default librarian reset key
  - `RESET123`

## Seat Status Colors

- Green: Vacant
- Black: Occupied
- Red: Floating

## Run Locally

```bash
npm install
npm start
```

If you do not have PostgreSQL running locally and only want to preview the UI:

```bash
$env:ALLOW_IN_MEMORY_DB = "true"
npm start
```

If VS Code PowerShell blocks `npm`, use:

```bash
cmd /c npm.cmd install
cmd /c npm.cmd start
```

Open:

- Home page: `http://localhost:3000/`
- Student page: `http://localhost:3000/student`
- Librarian page: `http://localhost:3000/librarian`
- Super admin page: `http://localhost:3000/super-admin`

## Deploy To Render

The included `render.yaml` configures a Node.js web service and PostgreSQL database.

1. Push the repository to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Render will use `npm install` to build and `npm start` to run the service.
4. Keep the generated `JWT_SECRET` and PostgreSQL `DATABASE_URL` environment variables.

For future updates, commit and push changes to the branch connected to Render. With auto-deploy enabled, Render automatically deploys the latest commit.



## Layout Note

The seat map follows your hand-drawn layout closely, including passages, entry/exit markers, and wash room area.
