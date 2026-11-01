# Linked view pages for students, guides and lessons

Date: 2026-10-31. Status: design, awaiting the owner's approval. Builder check done; the owner answered its two questions.

## Why

A tester (signed in as an admin) found the system treats students, lessons
and guides as separate lists. Clicking a student, a user or a lesson goes
straight to its edit form, and nothing leads from one to the other. The
owner wants a firm link between them: from a student see their lessons and
responsible guide; from a guide see their students and lessons; from a lesson
see its students; and move between them by clicking.

Success: from any of the three, the related records are one click away,
in read-only view pages, without opening an edit form by accident.

## Goals

- A read-only **student page**, a read-only **user (guide) page**, and a
  read-only **lesson page**, each split into tabs.
- Clicking a student, user or lesson in the lists opens its view page, not
  the edit form. Edit stays one button away.
- The guide's own page is their existing **Profile**, which gains the same
  tabs.
- Same look as the rest of the system (colours, IBM Plex Sans Arabic, header,
  cards, radius) and uncluttered: one tab shown at a time.
- Works on a phone and on a desktop (layouts below).

## Non-goals

- No new permissions. Every page shows only the students and lessons the
  signed-in user can already see through the existing API and scope rules
  (`server/utils/studentScope.js`, lesson visibility). One deliberate
  addition, decided by the owner: a guide's full name and phone are shown to
  anyone who can see the student or lesson (see "Guide name and phone").
- No change to the edit forms themselves (EditStudent, EditUser, EditLesson),
  beyond being reached from the view pages.
- Sport lessons and the sport card are not part of this.

## Anti-goals (would count as a failure)

- A cluttered page with every section stacked at once.
- A user seeing a student or lesson they cannot see today, any of a guide's
  record beyond full name and phone, a link to a guide's page they cannot
  open, or an edit/print/roster button they have no permission for.
- Losing a way to reach the edit form, or to see a student's full details,
  that exists today.

## Layout (owner-approved mockup)

Phone: a top card with the passport photo, name and one line under it (class
for a student, role for a user), and under it the action buttons side by
side; below it a card with the tabs, one tab's content at a time.

Desktop: a fixed column on the right with the photo, name and the action
buttons stacked; the rest of the page holds the tabs. Rows may carry a little
more detail than on the phone (for example the room of a lesson).

## Student page

Tabs, always all three:

1. **Personal details** (التفاصيل الشخصية): every detail the edit form holds,
   read-only and grouped like the form's sections (personal, study, parents,
   health and notes). This is how a user without `students.edit` sees the
   full record, as they do today in the read-only form.
2. **Lessons** (الدروس): the student's lessons, each with name, day and time
   (desktop: room too). Clicking one opens the lesson page. Empty: the text
   «لا يوجد دروس بعد».
3. **Responsible guide** (المرشد المسؤول): full name and phone of
   `main_teacher`, see "Guide name and phone". Empty:
   «لا يوجد مرشد مسؤول بعد».

Buttons, each shown only to holders of its permission: **Edit**
(`students.edit`, opens the current EditStudent) and **Print file** (the
existing `exportStudentPdf`, under the permission the list's «ملف الطالب»
button uses today).

## Guide name and phone

Owner's decision. Wherever a guide is named on these pages (the student's
responsible guide, a lesson's guide), everyone who can see that student or
lesson sees the guide's **full name and phone number**, even without
`users.view`. Only a user who may open the guide's page (`users.view`, by
default the admin; or the guide themselves, through Profile) gets the name as
a link to it; for everyone else it is plain text and leads nowhere. Today these
roles see no guide name at all («…»), so the server has to send the name and
phone with the student or lesson; nothing else of the guide's record goes out.

## User (guide) page

Reached by an admin from the users list (`users.view`). Tabs:

1. **Personal details**.
2. **Their students**: students whose responsible guide (`main_teacher`) is
   this user. Clicking one opens the student page.
3. **Their lessons**: lessons this user teaches (as `teacher`, and as `helper`
   if the builder finds that natural). Clicking one opens the lesson page.

A tab with nothing in it is **not shown**. With neither students nor lessons,
the page shows no tabs at all, only the personal details (owner's rule; the
"no tabs at all" part is Claude's call).

Button: **Edit** (opens the current EditUser), for holders of `users.edit`.

## Profile (the guide's own page)

The existing Profile gets the same tabs: **My details** (everything Profile
has today, including editing and the password change), **My students**,
**My lessons**. Empty tabs are hidden as on the user page. From My students
the guide opens the student's view page (not the edit form).

## Lesson page

Tabs:

1. **Lesson details** (تفاصيل الدرس): name, day and time, room, guide. The
   guide's name links to the guide's page under the same rule as above.
   **Edit** button for `lessons.edit` (opens the current EditLesson). The
   tab shows the lesson's details in full, read-only, for everyone else.
2. **Students** (قائمة الطلاب): the lesson's students; clicking one opens the
   student page. Holders of `lessons.roster` can also add a student (same
   search as today, including the by-ID lookup for a student not in the list)
   and remove one, with a confirmation before removing. Others see the list
   only.

## Constraints

- Arabic, right-to-left; the system's existing tokens in
  `client/src/index.css` and existing UI parts.
- The server stays the authority: hiding a button is UI only.
- Photos shown at passport size through `passportSrc` like the rest of the
  system.
- The repo is public: no real names or records in tests or docs.

## Decided by the owner

- Three view pages with tabs; Profile is the guide's own page.
- Student page: all three tabs always, with the empty texts above.
- User page and Profile: empty tabs hidden.
- Lesson page: details and students tabs; add/remove students from there.
- Edit and print only for users with the permission.
- The student's personal details tab shows everything, read-only (no separate
  "full details" button).
- A guide's full name and phone are shown to everyone who can see the student
  or lesson; the link to the guide's page only with access to it.
- Uncluttered, in the system's style, phone and desktop layouts as mocked.

## Claude's calls (the owner may change them)

- The list rows open the view page; the existing edit/«ملف الطالب» buttons in
  the lists may stay as shortcuts.
- A user page with no students and no lessons shows no tabs.
- Remove-from-lesson asks for confirmation.

## Left to the builder

- Routes for the view pages and how the edit forms move (for example
  `/students/:id` for the view and `/students/:id/edit` for the form), keeping
  `/students/new`, the invite registration route and existing deep links
  working.
- Where the data comes from: a student's lessons, a guide's students and
  lessons, and the guide's name on a student page for a user without
  `users.view` (the server sends name and phone only, as the sport card sends
  the name). New endpoints, if any, must apply the existing scope rules.
- Reusing the existing roster add/remove (`LessonRoster`, `/lesson/addToList`,
  `/lesson/removeFromList`, record locks) rather than a second copy.
- Tests, and Codex review per `docs/AI_COLLABORATION.md`.
