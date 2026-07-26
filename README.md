# Library Seat Management System

A deployable Node.js app for a real library workflow:

- Students open one website link and only view seat status
- Librarians open the same website, choose the librarian option, and log in
- You keep super admin access for setup and maintenance

## Included Views

- `Home`: choose `Student` or `Librarian`
- `Student`: public seat map with live vacant/occupied status
- `Librarian`: username login, search seats, toggle seats, settings button, reset all seats using reset key
- `Super Admin`: hidden management panel for librarian accounts, library name/logo, and librarian reset key

## Database Storage

The app now stores data in a real SQLite database file:

- Database file: `data/library.db`
- Stored data:
  - librarian and super admin accounts
  - seat statuses
  - library settings

This means the seat status stays saved after restart and is suitable for deployment on a VPS or hosting where the filesystem persists.

## Tech Stack

- Node.js
- Express
- SQLite
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

## Run Locally

```bash
npm install
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

## Deployment Notes

- Put the app behind HTTPS in production
- Use a strong `JWT_SECRET`
- Keep `data/library.db` on persistent storage
- Back up `data/library.db` regularly because it contains the live seat state and login data

## Layout Note

The seat map follows your hand-drawn layout closely, including passages, entry/exit markers, and wash room area.
