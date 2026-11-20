# Codex request: student to staff design (2026-11-19)

Base: `1ff124e`. Spec: `docs/superpowers/specs/2026-11-19-student-to-staff-design.md`. Design only; no code changed.

Owner decisions (2026-11-13, 2026-11-14, 2026-11-19): a button on the student page opens a new staff user filled from the student; the student is archived (never deleted) and linked to the user, and stays in his programs as a staff participant; the program's «المرشد / الإدارة» becomes «المسؤول» with a searchable choice field; any assistant may be in charge of a regular program, only a guide or a manager of a درس تربوي; «المسؤول» on every program label; changing a program with an assistant in charge to تربوي is refused.

Please check: whether anything that serves "the person in charge" is not role-blind (alerts, reminders, scope, display, Sport, assistant tools); every place an archived student must disappear from; the order and failure handling of make-staff (user created, archive failed); the server rule for تربوي on create and on kind change; the combobox accessibility plan.

## Revision 2 (2026-11-19)

The spec was rewritten for all 16 findings of `docs/reviews/2026-11-19-codex-student-to-staff-design-review.md` and five owner decisions (items 7-11 in the spec). Please check that each finding is answered, especially the conversion order and resume (section C), attendance by conversion date (D), and the archive inventory (E).

## Revision 3 (2026-11-19)

Fixes the 10 points of `docs/reviews/2026-11-19-codex-student-to-staff-design-review-2.md`: conversion phases with a fixed userId and a claim (C), cutover the day after with per-program provenance (D), scope check, one attendance predicate for save/lock/client with expanded revokes, `any` mode for Sport and purge (E).

## Revision 4 (2026-11-19)

Fixes the 4 points of review 3: `plannedLessons` fixed at "prepared" (C step 3, 5; D), idempotent per-lesson moves with claim renewal, stored rows never hidden, resume scope over the planned programs.

## Revision 5 (2026-11-19)

Fixes the 2 points of review 4: preparation barrier with roster-writer re-check and final rescan (C step 3, 5); stored rows on or after the cutover deleted or re-keyed (D).
