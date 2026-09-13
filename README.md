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
│       ├── pages/           one file per screen (home, week, commitments,
│       │                    subjects, topics, syllabus import, tests, progress)
│       ├── components/      reusable pieces — the week grid, the charts
│       │                    and the LLM Bridge live here
│       ├── hooks/           shared behaviour (loaded data, notes, toasts)
│       ├── api/             how the screens talk to the server
│       └── lib/             prompts, schemas, the JSON checker, formatting
│
└── server/                  the part that stores and serves data
    ├── data/                your database file lives here
    └── src/
        ├── routes/          the web addresses the app responds to
        ├── services/        the thinking: syllabus reading, tracking numbers,
        │                    the week planner, the progress figures, and
        │                    test analysis
        ├── lib/             small shared helpers (dates, times, validation)
        └── db/              database connection, seed data, schema history
            └── migrations/  numbered .sql files that build the schema
```

---

## What this phase does

**Phase 4 — Test analysis and AI insights.**

### Tests
A new **Tests** screen (`/tests`) is for logging what actually happened in an
exam: the name, date, source, and score. That much takes ten seconds. If you
have the time, the test's own page lets you break it down question by
question — which subject and topic each question belonged to, whether it was
attempted, whether it was right, the marks, and how long it took. Nothing
here needs an AI: the accuracy figures, the per-subject breakdown, and the
average time per question are worked out immediately on the page, from
whatever you've entered.

### What this test says
This is the second real use of the LLM Bridge from Phase 1, alongside syllabus
import. Once a test has a score or a few questions logged, **Analyse this
test** writes a prompt containing the whole breakdown and asks Claude or
ChatGPT to find the pattern in it — not just a list of what was wrong, but
whether the mistakes look like careless slips or real gaps, whether timing
suggests you were rushed, and two or three specific, doable things to do
about it. You paste the reply back, check it over, and it's saved against
that test. Every saved analysis stays on the test's page, oldest at the
bottom.

### This week's plan
On **Progress**, a card called *This week's plan* builds a prompt out of your
recent test analyses, your current topic list, and how the week has gone so
far, and asks for a short, specific list of priorities — not a generic study
schedule. Paste the reply back and it's saved. Each priority that names a
real topic gets an **Add to plan** button: press it and the app finds the
next free gap for it and shows you exactly where — the day, the time, how
long — before anything is booked. You still decide.

This is the same "suggest, you decide" shape Phase 3 used for a shaky topic's
extra revision, used again here because it held up well: the app can look for
room in your week, but it never fills it in without asking.

### Study notes for a topic
Open any topic to edit it and there's a **Generate study notes** button. It
asks Claude or ChatGPT for a compact, exam-night summary of the topic's key
concepts, plus a short list of things worth looking up. Resources come back
as things to search for — "Khan Academy: Newton's Laws" — rather than links,
because an assistant has no way of knowing which URLs still work. Saved notes
sit on the topic's edit screen and can be regenerated any time.

### A bug this phase's testing caught
Building the study-notes feature meant opening one modal (the LLM Bridge)
from inside another (the topic's edit form) for the first time anywhere in
the app. It turned out `Modal` closed on Escape by listening globally, so
with two open at once, one press of Escape closed *both* — the bridge you
meant to dismiss, and the form underneath it, discarding whatever you were
editing. Fixed by having each modal register itself on a small stack and only
the top one respond to Escape. Worth knowing about because it's the kind of
bug that only shows up once two dialogs are ever nested, which nothing before
Phase 4 did.

### What Phase 4 adds to the data model
Nothing new — `test`, `test_result` and `analysis` were already built out in
full back in Phase 1, exactly so this phase could fill them in rather than
migrate around them. The one small addition is on `topic`: `resources` (a
JSON list of `{title, type, note}`) now has a validated write path through
the API, alongside `key_concepts`, which already existed.

---

**Phase 3 — Study sessions and progress tracking.**

### Recording a session
Tick a block off — on your week, or in the Today list on the home page — and it
asks **how did that go?** rather than just marking it done:

- how it felt, from *I could teach it* down to *Lost*;
- how long it really took, pre-filled with what was planned, because the two
  being different is worth knowing;
- anything worth remembering.

Studying done away from the plan is recorded with **Log time** on any topic in
the topic list. Un-ticking a block deletes the session it created, so nothing is
ever counted twice.

A session nudges its topic along — *Learning* after a study block, *Revised*
after a revision block. It never marks a topic *Confident* on your behalf; that
one is your call.

### When something felt hard
Rate a session *Shaky* or *Lost* and the app looks for the next free gap and
offers it: "there is room for another 20 minutes on Thursday at 5pm." Nothing is
booked unless you say yes. The plan stays yours.

### Progress
The **Progress** page has four ranges — four weeks, three months, a year — and
shows:

- **Minutes studied each day**, with the busiest day picked out.
- **Where the time went**, per subject, in the subject's own colour with its
  name beside it.
- **How the topics stand** across the four stages.
- **How things have felt** — one small panel per subject rather than five lines
  on one plot, because confidence scores between 1 and 5 converge into a knot
  if you draw them together.
- **Worth another look** — the topics whose last rating was low.
- **Everything you have recorded**, which is also the plain-text version of
  every chart above it.

Days with nothing on them are simply not counted. There is no streak to break
and no "missed" figure anywhere: a quiet day costs you nothing, which is the
whole point.

### About the colours
The subject colours shipped in Phase 1 were picked by eye, and they failed a
colourblindness check badly — under deuteranopia the Mathematics and AI colours
were almost the same colour, and two more read as grey. They have been replaced
with a validated palette: eight hues in a fixed order, each checked for
lightness, saturation, contrast against the page, and separation from its
neighbours under simulated protanopia and deuteranopia.

Two consequences worth knowing:

- **Existing subjects were re-coloured** when the app updated. The order is what
  makes the palette safe, so colours are handed out by position rather than
  preference, and your subjects were moved onto the matching slots.
- **Nothing anywhere relies on colour alone.** Calendar blocks carry their
  tracking number, chart bars carry the subject name, the small multiples carry
  a title. Colour ties the screens together; the label is what identifies.

Topic status is a progression rather than four unrelated things, so it uses one
colour stepped light to dark instead of four separate colours.

### What Phase 3 adds to the data model
- `study_session.plan_entry_id` — ties a session to the block it came from, so
  un-ticking that block takes the session away again. Sessions logged off-plan
  leave it empty, and deleting a block keeps the session.

---

**Phase 2 — Timetable with anchors and calendar.**

### Fixed commitments: whole week patterns
Under **Week → Set up your week** (or `/anchors`) you build **week
patterns** — a whole named Monday-to-Sunday shape, not a pile of individual
rules. Every student starts with one, "Regular week," marked **Default**: it
governs every calendar week until you say otherwise. Add blocks to it —
school, coaching, sport, meals, family time, sleep, anything — the same way
across as many days as it happens; start from a typical school week if you'd
rather edit one than build from nothing.

When term life needs a different shape for a stretch — an exam week, a
sports camp, a run with no coaching at all — click **+ New week pattern**,
name it, and build it out the same way. Then **Apply to weeks…** and pick
which calendar weeks (from a grid numbered 1 to 52) should use it instead.
Applying **replaces** the default for those weeks entirely: an Exam week
pattern with no Football block in it means no Football that week, even
though Football is part of your Regular week. Untick a week, or delete the
pattern, and it goes straight back to the default.

Weeks are numbered from a **term start date**, shown at the top of the page
as "Counting weeks from ⟨date⟩ as Week 1." It defaults to the Monday of the
current week so the feature works immediately; click **change this** once to
set it to when your actual term began, and every week number lines up with
it from then on.

Anything running past midnight goes in as two blocks — one up to 23:59 and
one from 00:00 — so a block always has an end time later than its start.

A commitment's *name* has always been free text — you don't need a special
category to call something "Aakash Coaching," "Football," or "Movie Time";
just type that as the name and pick whichever **kind** (School, Coaching,
Sport, Meal, Family, Sleep, Exam, Other) fits closest for its colour.

### Anything extra — on top of whichever pattern applies
Below the week patterns sits a second, additive layer for things that are
not part of any regular week: an exam sitting, a one-off extra class,
something that should happen *in addition to* whatever pattern already
governs that week, without your having to build a whole new pattern for it.

1. Click **Add something extra**.
2. Under **Applies to**, choose **Every week** for something recurring
   regardless of pattern, or **Just some weeks** to scope it — pick from the
   same 1–52 grid.
3. Save. It layers on top; it never replaces anything.

Adding one across several days *and* several weeks at once creates one row
per combination — a Tuesday-and-Thursday extra class across weeks 20 and 21
becomes four rows. Editing an existing one just moves that one row to a
different single week.

### The week calendar
**Week** shows seven columns with the hours down the side. Commitments sit
behind everything as soft washes; study blocks are cards in their subject's
colour; revision blocks are outlined and marked with ↻. On a phone it becomes
one day at a time with a row of day chips.

- **Drag a block** to another day or time. Dropping snaps to the nearest five
  minutes.
- **Drag a topic** from *Waiting for a slot* straight onto a day.
- **Tap a block** to change its day, time or length, tick it off, or take it
  off the calendar.
- Ticking a study block off moves its topic to *Learning*; ticking a revision
  block off moves it to *Revised*.

### Plan my week
One button fills the week's free time. It works in a deliberately predictable
order, so you can always see why it chose what it chose:

1. topics with a target date, soonest first;
2. then everything else in the order you arranged it, subject by subject.

Each topic goes into the earliest gap on the earliest day that it actually
fits, leaving the break you asked for between blocks. Topics that will not fit
are never dropped silently — they stay in the waiting list and the app says why
in plain English ("every day in this stretch is already at its 4-hour limit").

Days that have already gone by are left alone, and so are the hours earlier
today.

### Or let an assistant plan it
**"Ask Claude or ChatGPT to plan it,"** next to Plan my week, hands the same
job to a conversation instead of the built-in algorithm. It writes a prompt
containing everything the app knows — your fixed commitments, anything
already on the calendar, and every topic waiting for a slot — and asks for a
day-by-day timetable back. The prompt itself asks for a realistic mix rather
than a cram session: subjects interleaved instead of blocked for hours at a
stretch, a topic's own sub-topics spread across days instead of chained
one after another, and only the first sitting for each sub-topic — this app
books its revision follow-ups automatically once it's saved, so the
assistant is asked not to add those itself.

Paste the reply in and it goes to a review list: each proposed block shows
the topic it matched to, with its date, time and length all editable, and a
tick box to leave anything out. Nothing is booked until you press Save. A
block that names a tracking number the app doesn't recognise — already
scheduled, or not on your list at all — is called out and left aside rather
than silently dropped or guessed at.

### Planning against an exam date
Set an **exam date** and a **cover every topic by** date under Fixed
commitments (`/anchors`) and the prompt paces itself against them:
- Before the coverage deadline, it's told roughly how much new content is
  still waiting and how many days are left to get through it, and asked to
  weight the timetable towards coverage.
- After it, it's asked to favour revision, consolidation and practice
  questions over new topics instead.
- A stretch that straddles the deadline is told to finish off what's left
  before it, then shift towards revision after.

Both dates are optional — leave them unset and the prompt just doesn't
mention them.

### Replanning as you go
Next to the assistant button is **how far ahead to plan** — the current
week by default, or 2 weeks, 4 weeks, or everything up to the coverage
deadline (once one is set). Only topics still waiting for a slot are ever
included, so opening this again later — after finishing some topics,
falling behind on others, or just wanting a fresh look — always plans
around wherever things actually stand, not a stale snapshot from whenever
it was first set up.

When a topic has sub-topics, the prompt lists them out individually (`PHY-001/01`,
`PHY-001/02`, …) and asks the assistant to schedule one sitting per sub-topic
rather than one long block for the whole topic, splitting the topic's total
time across them however it sees fit. A topic with no sub-topics still gets
one plain block, as before. The review list and the calendar both show the
sub-topic's own text under its number, and its revision chain stays scoped
to that one sub-topic.

Whichever way a study block gets booked — this, Plan my week, or dragging a
topic on by hand — its revision chain is booked automatically the same way.
(Plan my week still books a topic as one whole block; only the assistant
prompt currently schedules sub-topic by sub-topic.)

### Revision, booked automatically
Every study block gets three short revision blocks after it — the next day,
three days later and a week later. A revision block is about a third of the
length of the session it follows, kept between the shortest and longest you
allow. Move a study block to another day and its unfinished revisions move
with it; delete it and they go too.

### Planner settings
Under **Planner settings**: the earliest and latest the day may run, the break
between blocks, the most study in one day, and whether revision is booked at
all. The daily limit counts revision as well as study, and a quarter of it is
held back for revision so that adding the follow-up blocks cannot push a day
past its limit.

### More on the data model
Phase 2 adds:

- `plan_entry.parent_entry_id` — ties a revision block to the study block that
  created it, so moving or deleting one carries the other along.
- `setting` — a small key/value store, used for the planner's preferences and,
  under the key `term`, the term start date plus the optional `exam_date` and
  `cover_by_date` the AI-scheduling prompt paces itself against.
- `anchor.effective_from` / `anchor.effective_until` — scope an *extra*
  commitment to a run of dates instead of forever.
- `exam` joined the list of recognised commitment kinds.
- `week_template`, `week_template_block`, `week_assignment` — the whole-week
  patterns described above. A template's blocks are the always-there shape of
  a week; `week_assignment` says which calendar week numbers use which
  template, falling back to the one marked `is_default`. `anchor` remains the
  *extras* layer, resolved on top of whichever template governs a given
  week — see `templateService.resolveEffectiveAnchors`, the one place that
  turns "which pattern governs which week" back into the flat, date-scoped
  shape the scheduler already understood before templates existed.

---

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

Sub-topics carry their own number too — `PHY-001/01`, `PHY-001/02` — shown
wherever a topic's sub-topics are listed, on the topic list and when editing
one. It is positional: it reflects where a sub-topic currently sits in the
list, the same way the list itself is ordered.

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

**My subject colours changed by themselves** — they were replaced in Phase 3
because the originals were not safe for colourblind readers. Pick different ones
any time under Subjects; the eight offered are all checked against each other.

**The planner put nothing in, or very little** — it usually means the days are
already full. Check *Planner settings*: the day may be too short, the daily
limit too low, or your commitments may be covering more of the week than you
meant. The list under the calendar says which topics did not fit and why.

**The syllabus split into the wrong things** — change *Units and chapters* on
the review screen, or fix it by hand there. Nothing is saved until you press
Save, so there is no harm in trying both.

**Anything else** — stop the app with `Ctrl + C`, run `npm install` again,
and start it with `npm run dev`.
