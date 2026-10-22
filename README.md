# Untangle

**Turn a wall of instructions into one clear step at a time.** Paste an email, a letter or an assignment brief; Untangle
pulls out what you have to do, by when, what to have ready and what to watch out for, then walks you through it one step
at a time. Everything happens in your browser.

Live demo: https://hyunsikparker.github.io/untangle/ · Video walkthrough (1 min 8 s, captions):
https://hyunsikparker.github.io/untangle/demo.html

The video is recorded from the page by `scripts/demo.mjs` (Playwright), which first checks the numbers the narration
quotes against the page. The narration is a synthetic voice (Qwen3-TTS, run locally).

## The problem

Important instructions often arrive as one dense message: a financial aid office asking for documents, a landlord's
move-out letter, an assignment brief, a first-day email from a new job. The steps, the deadline, the documents to gather
and the "do not" warnings are mixed into the same paragraphs, sometimes in the same sentence.

Most people don't read such a message word by word. In Jakob Nielsen's study of how people read on screen, 79% of
participants scanned a new page and only 16% read it word for word
([Nielsen Norman Group, 1997](https://www.nngroup.com/articles/how-users-read-on-the-web/)). Scanning a dense message is
how a deadline or a "do not email the documents" line gets missed. It is harder still for someone with ADHD or dyslexia,
for someone reading in a second language, or for a screen-reader user who has to listen to the whole message again to
find one date.

## Who it helps

Anyone who has to act on a long message, and especially students facing administrative email for the first time, people
for whom long text is tiring to read, and screen-reader and keyboard users.

## What it does

1. **Untangle.** Paste the message (or try one of three made-up examples) and press *Untangle it*. You get:
   - **Steps**: sentences that ask you to do something ("Submit…", "You must…", "Make sure…") and numbered or
     bulleted items, rewritten as short instructions ("You will need to submit the documents by Friday" becomes
     "Submit the documents by Friday"). Conditions stay attached ("Only if you are a dependent student").
   - **Due dates**: "by Friday, November 6 at 5:00 p.m.", "within 10 business days" or "before October 22" become
     dates, counted from the day the message arrived, with "in 11 days" shown next to each. A window that starts with
     something you have not done yet ("After you upload your documents, … within 10 business days") keeps its wording
     instead of a guessed date, and opening hours ("Monday to Friday, 9 a.m. to 4 p.m.") are not read as dates.
   - **Have ready**: items from "You will need:" lists, "Bring…" sentences and lists of documents.
   - **Watch out**: sentences with "do not", "late", "will not be accepted", "not allowed" and similar.
   - **Contacts and links**, **every date in the message**, and the rest of the message, folded away.
2. **One step at a time.** Focus mode shows a "before you start" card (things to have ready and warnings), then one step
   per screen in large text with its due date. *Done*, *Skip for now* and *Back*, or Enter and the arrow keys. At the end
   it lists what is left. An optional 10-minute focus timer, and read-aloud that only uses voices installed on the
   device.
3. **Keep track.** Tick steps and documents off; progress stays in this browser. Add the dated steps to a calendar
   (`.ics` with reminders) or copy the checklist as text.
4. **Read comfortably.** Larger text, wider spacing and an easy-read font, applied to the whole page.

Every step keeps the sentence it came from: *Original wording* shows it, because a rewritten step is a reading aid,
and the exact words are what count.

## Example

The built-in financial aid email has 13 sentences and a three-item bulleted list. Untangle turns it into 4 steps (one with a
deadline at 5 pm, and one to do within 10 business days after the upload), 3 documents to have ready, 3 warnings ("Do not
email documents", "Late documents may delay your aid…") and the office's contact details, and sets the rest of the message
aside.

## How it reads a message

- Lines are split into list items and sentences without breaking on "e.g.", "a.m.", "Dr." or initials. A list keeps
  the sentence that introduced it, so "You will need to submit the following documents:" turns its bullets into
  documents to have ready, while "Before your first day, please complete the following:" turns them into steps and
  passes its date on to them.
- A sentence is a step when it starts with one of about 190 instruction verbs (after lead-ins such as "please" or
  "next"; a timing clause such as "after you upload your documents," stays at the front of the step), when it says what
  you or someone else must, should or need to do, or when it states that something "is due" on a date. Questions,
  greetings and "read this message" lines are not steps.
- Dates are found in the usual forms (`November 6`, `6 November`, `11/6`, `2026-11-06`, `Friday`, `tomorrow`,
  `within 10 business days`, `end of the month`). A date reads as a deadline when "by", "before", "due" or "no later
  than" comes right before it; "by courier on Friday" does not count.

## Honest limits

- It works on English text and uses rules, not a language model, so it can miss a step that is phrased unusually or
  pick up a sentence that is only background. That is why every step shows its original wording, and why the full
  message stays one click away.
- It does not understand the content: it will not tell you whether a step applies to you beyond the conditions written
  in the text, and it is not advice.
- Dates without a year are taken to be the next occurrence; check them if a message is old.

## Privacy

There is no server, no account and no analytics. The deployed page ships a Content Security Policy with
`connect-src 'none'`, so the browser blocks any network request from the page. What you paste and your progress are kept
only in this browser's local storage; *Clear my text* removes them. Read-aloud uses only voices that run on the device
(`localService`), so the text is not sent to an online speech service.

## How it was checked

- 15 unit tests (`npm test`): dates (relative words, business days, years, times, deadline versus appointment, opening
  hours and windows that start later), sentence splitting, list handling, rewriting obligations as instructions,
  contacts, the three examples, an onboarding email, and the calendar and text exports.
- 3 browser tests (`npm run test:e2e`, Playwright on the production build): the financial aid example end to end
  including focus mode by keyboard and the calendar downloads (that example and the move-out letter), an automated
  accessibility scan with axe (no
  violations), no console errors, no network requests, pasting your own text, reading settings and progress kept
  across a reload, and phone width.
- The calendar file from the browser test is parsed again with the Python
  [icalendar](https://pypi.org/project/icalendar/) library (`python3 scripts/check_ics.py
  test-results/untangle-moveout.ics`): one timed event with a reminder an hour before and one all-day event with a
  9 am reminder, no duplicate UIDs.

## Run it locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # unit tests
npm run test:e2e   # browser tests on the production build
```

## Code map

- `src/parse.ts` splits the text and sorts sentences into steps, things to have ready, warnings and contacts.
- `src/dates.ts` finds dates and times and resolves relative words.
- `src/ics.ts` writes the calendar file and the plain-text checklist.
- `src/App.tsx` and `src/styles.css` are the interface, including focus mode and the reading settings.

## Credits and disclosure

- Built during Taskforge 2026 (started October 22, 2026). The date-handling and calendar-folding code follows the
  approach of my own Crunchmap project (built the same day for another hackathon); no other pre-existing code.
- **AI assistance:** built with Claude (Anthropic), an AI coding assistant, which wrote the code, the tests and this
  README.
- Libraries: React, Vite and TypeScript; Vitest, Testing Library, Playwright and axe-core for tests; the Python
  icalendar library for the calendar check.
- The example messages, people, addresses, phone numbers and the university are made up.

## License

MIT
