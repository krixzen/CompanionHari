# Study Planner

A calm, private study planner that runs entirely on your own computer.

Nothing is sent to the internet. There are no accounts, no API keys, and no
subscriptions. Your subjects, syllabus and topics are stored in a single
database file inside this folder, so clearing your browser will never lose
your work.

---

## What you need before you start

Just one thing: **Node.js version 20 or newer.**

To check whether you already have it, open a terminal (on Windows: "Command
Prompt"; on Mac: "Terminal") and type:

```
node -v
```

If you see something like `v20.11.0` or `v22.1.0`, you are ready. If you see
"command not found", download the **LTS** version from
[nodejs.org](https://nodejs.org) and install it, then close and reopen the
terminal.

---

## Installing (once)

1. Open a terminal.
2. Move into this project folder. For example:
   ```
   cd path/to/study-planner
   ```
3. Install everything with one command:
   ```
   npm install
   ```

This downloads the pieces the app is built from. It takes a minute or two the
first time and never needs to be repeated unless the project changes.

---

## Running the app

From the same folder, run:

```
npm run dev
```

You will see two sets of messages appear — one from the **server** (the part
that stores your data) and one from the **client** (the part you look at).

Then open your browser at:

**http://localhost:5173**

To stop the app, click on the terminal and press `Ctrl + C`.

---

## Where your data lives

Everything is kept in one file:

```
server/data/study-planner.db
```

Copy that file somewhere safe now and then and you have a complete backup.
It is deliberately excluded from version control, so your personal study data
is never uploaded anywhere.

---

## The commands, in plain English

| Command | What it does |
| --- | --- |
| `npm install` | Sets the project up. Run once. |
| `npm run dev` | Starts the whole app for everyday use. |
| `npm run build` | Packages the app for sharing. Not needed day to day. |
| `npm run db:migrate` | Brings the database up to date after an update. |
| `npm run db:reset` | **Erases all data** and starts from an empty database. |

---

## How the project is laid out

```
study-planner/
├── client/                  the part you see in the browser
│   └── src/
│       ├── pages/           one file per screen
│       ├── components/      reusable pieces of interface
│       ├── hooks/           shared behaviour used by screens
│       ├── api/             how the screens talk to the server
│       └── lib/             small helpers
│
└── server/                  the part that stores and serves data
    ├── data/                your database file lives here
    └── src/
        ├── routes/          the web addresses the app responds to
        ├── services/        the thinking: parsing, numbering, rules
        └── db/              database connection and schema history
            └── migrations/  numbered .sql files that build the schema
```

---

## What this phase does

**Phase 0 — Project skeleton.** This phase contains no features on purpose.
It sets up the frontend, the backend, the database connection and the single
`npm run dev` command, and shows a placeholder home page that confirms the
browser can reach the server. Subjects, syllabus import and topic planning
arrive in Phase 1.

---

## If something goes wrong

**"Port 5173 is already in use"** — the app is probably already running in
another terminal window. Close that window, or press `Ctrl + C` in it.

**The page says it cannot reach the backend** — the server half did not
start. Look in the terminal for a red error message just above.

**Anything else** — stop the app with `Ctrl + C`, run `npm install` again,
and start it with `npm run dev`.
