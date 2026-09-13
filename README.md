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
│       ├── pages/           one file per screen (home, subjects, topics, import)
│       ├── components/      reusable pieces — the LLM Bridge lives here
│       ├── hooks/           shared behaviour (loaded data, notes, toasts)
│       ├── api/             how the screens talk to the server
│       └── lib/             prompts, schemas, the JSON checker, formatting
│
└── server/                  the part that stores and serves data
    ├── data/                your database file lives here
    └── src/
        ├── routes/          the web addresses the app responds to
        ├── services/        the thinking: syllabus reading, tracking numbers
        └── db/              database connection, seed data, schema history
            └── migrations/  numbered .sql files that build the schema
```

---

## What this phase does

**Phase 1 — Foundation, syllabus and topics.**

### Subjects
Five subjects are there from the first run — English, Physics, Chemistry,
Mathematics and Artificial Intelligence. Add your own, rename them, give them
a colour (those colours become the calendar blocks in Phase 2), drag them into
the order you think about them, and delete the ones you do not need.

### Bringing in a syllabus
Open a subject and choose **Import a syllabus**. You can:

- **upload a PDF or a text file** — the text is pulled out on this computer and
  never uploaded anywhere;
- **paste the text in** — handy for a short syllabus, or a PDF that will not
  read properly;
- **ask Claude or ChatGPT for help** — the app writes a prompt, you paste it
  into the assistant yourself and paste the reply back. See the LLM Bridge
  below.

The file is read by looking for numbering, bullets and unit or chapter
markers. No AI is involved in that reading. Whatever it finds is shown on a
**review screen** where you can fix titles, add or remove sub-topics, change
study times and untick anything that is not really a topic. **Nothing is
written to the database until you press Save.**

If the split came out at the wrong level, two settings on the review screen
re-read the same text a different way:

- *Units and chapters* — whether each unit is a topic in its own right, or a
  grouping for the topics beneath it.
- *Split lines like "Sets: finite sets, subsets, power set"* — turns a
  comma-separated tail into sub-topics.

If a PDF is a scan or a photograph, there is no text in it to read. The app
says so and asks you to paste the text in instead.

### Topics
Each saved topic gets a tracking number built from the subject's prefix —
`PHY-001`, `MATH-014`. Numbers are never handed out twice, so deleting
`PHY-007` leaves a gap rather than freeing the number: `PHY-012` means the same
topic in March as it did in September.

The topic list lets you search titles, sub-topics and tracking numbers, filter
by status and difficulty, edit study time straight in the row, change status
from the row, drag topics into a different order, select several at once and
set all their study times together, and add topics by hand when a syllabus is
short. Dragging is switched off while a search or filter is active, since the
order you can see is not the whole order.

### The LLM Bridge
This app makes no network calls to any AI service, and never will. Instead,
`client/src/components/LLMBridge.jsx` is a reusable window with two halves:

1. the prompt it has written for you, with a **Copy prompt** button;
2. a box to paste the assistant's reply into.

Press **Parse & preview** and the reply is stripped of any ``` fences, read as
JSON and checked against the shape that feature expects. If something is wrong
it says exactly what — *"topics[0] is missing \"title\"."* — and lets you edit
and try again. If it is right, you see a preview and nothing is saved until
you confirm.

It takes a prompt and a schema as props, so Phase 4's test analysis will use
the very same component.

### A note on the data model
Every table from the plan exists already — students, anchors, subjects,
topics, study sessions, plan entries, tests, test results and analyses — even
though Phases 2 to 4 are what fill most of them in. Two columns were added
beyond the original list because Phase 1 needs them:

- `subject.code` — the prefix that tracking numbers are built from. It has to
  live somewhere, and deriving it from the name each time would collide for
  subjects like Physics and Physical Education.
- `subject.next_topic_number` — the counter that stops a tracking number ever
  being reused.
- `topic.unit` — the unit or chapter a topic sits under, which the syllabus
  reader already works out.

The app is set up for one student. Every table still carries a `student_id`,
so turning on multiple profiles later needs no change to the schema.

## If something goes wrong

**"Port 5173 is already in use"** — the app is probably already running in
another terminal window. Close that window, or press `Ctrl + C` in it.

**The page says it cannot reach the backend** — the server half did not
start. Look in the terminal for a red error message just above.

**A PDF imports as nonsense, or not at all** — it is probably a scan or a
photograph, which has no text inside it to read. Copy the syllabus text from
wherever you can and use the paste box instead.

**The syllabus split into the wrong things** — change *Units and chapters* on
the review screen, or fix it by hand there. Nothing is saved until you press
Save, so there is no harm in trying both.

**Anything else** — stop the app with `Ctrl + C`, run `npm install` again,
and start it with `npm run dev`.
