# Actual Claude review: restore former desktop navigation

Codex implements; actual Claude Code reviews independently without editing.
Review this source-only patch. Do not run tools, read files, request another
reviewer, or contact services. No real records, environment or runtime logs are
included.

Owner says desktop navigation also looks worse than before. Restore the former
pre-grouping dark rounded bar (f33f475) with centered direct page links. Retain
current program-first order, weekly tasks, notices, translated labels and all
existing permission filtering. The grouped phone menu stays as restored.

Minimal patch: on desktop render the already-filtered groups' items as direct
links, using the existing link helper; phone keeps the current group rendering.
Restore former desktop CSS centering, pill radius, spacing and hover appearance.
Update the existing desktop test for direct navigation, active page and resizing
to phone groups and back. All 21 focused Header tests passed. Actual-component
browser rendering checked 1280, 900 and 769 pixel desktops and 375 pixel phone;
all links remain in the bar when wrapping. Full npm run verify is in progress.

Report concrete regressions or accessibility issues with file/line and failure
scenario, or explicitly no findings. Do not claim runtime/production verification.

```diff
diff --git a/apps/system/src/Components/Header/Header.test.js b/apps/system/src/Components/Header/Header.test.js
index a020f8b..549b747 100644
--- a/apps/system/src/Components/Header/Header.test.js
+++ b/apps/system/src/Components/Header/Header.test.js
@@ -126,19 +126,24 @@ test("each page link follows its permission", async () => {
 });

 const groupButton = (name) => [...host.querySelectorAll('#main-nav button')].find((button) => button.textContent.includes(name));
-test("desktop groups open on click and ArrowDown, close on Escape/outside, and mark the active page", async () => {
+test("desktop pages are direct links, mark the active page and keep phone groups after resizing", async () => {
   await mount();
   expect(host.querySelector('#main-nav a').textContent).toBe("البرنامج");
   expect(host.querySelector('#main-nav a').getAttribute("aria-current")).toBe("page");
-  const people = groupButton("الأعضاء والطاقم");
-  await act(async () => people.click());
-  expect(people.getAttribute("aria-expanded")).toBe("true");
-  await act(async () => host.querySelector('a[href="/students"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
-  expect(people.getAttribute("aria-expanded")).toBe("false");
-  expect(document.activeElement).toBe(people);
-  await act(async () => people.click());
-  await act(async () => document.body.click());
-  expect(people.getAttribute("aria-expanded")).toBe("false");
+  expect(host.querySelectorAll('#main-nav button')).toHaveLength(0);
+  expect(host.querySelector('#main-nav a[href="/weekly-tasks"]').closest('[hidden]')).toBeNull();
+  await act(async () => host.querySelector('#main-nav a[href="/students"]').click());
+  expect(at()).toBe("/students");
+  expect(host.querySelector('#main-nav a[href="/students"]').getAttribute("aria-current")).toBe("page");
+  window.innerWidth = 375;
+  await act(async () => window.dispatchEvent(new Event("resize")));
+  await act(async () => host.querySelector('[data-tour="menu-toggle"]').click());
+  expect(groupButton("الأعضاء والطاقم").getAttribute("aria-expanded")).toBe("true");
+  window.innerWidth = 1280;
+  await act(async () => window.dispatchEvent(new Event("resize")));
+  expect(host.querySelector('[role="dialog"]')).toBeNull();
+  expect(host.querySelectorAll('#main-nav button')).toHaveLength(0);
+  expect(document.body.style.overflow).not.toBe("hidden");
 });
 test("phone dropdown expands groups, closes after navigation and returns focus to its toggle", async () => {
   window.innerWidth = 375;
diff --git a/apps/system/src/Components/Header/NavigationMenu.jsx b/apps/system/src/Components/Header/NavigationMenu.jsx
index efc1f86..e2bd2f2 100644
--- a/apps/system/src/Components/Header/NavigationMenu.jsx
+++ b/apps/system/src/Components/Header/NavigationMenu.jsx
@@ -72,7 +72,8 @@ export default function NavigationMenu({ groups, program, mobile, open, onClose,
       {mobile && <div className={styles.menuHeading}><strong>القائمة الرئيسية</strong><button type="button" onClick={onClose} aria-label="إغلاق القائمة">×</button></div>}
       <nav id="main-nav" data-tour="menu" aria-label="التنقل الرئيسي" className={styles.nav}>
         {program && <div className={styles.shortcut}>{link(program)}</div>}
-        {groups.map((group) => <div key={group.id} className={styles.group}>
+        {!mobile && groups.flatMap((group) => group.items).map(link)}
+        {mobile && groups.map((group) => <div key={group.id} className={styles.group}>
           <button ref={(element) => { triggers.current[group.id] = element; }} type="button"
             className={styles.groupButton} data-active={group.id === activeGroup}
             aria-expanded={expanded === group.id} aria-controls={`nav-group-${group.id}`}
diff --git a/apps/system/src/Components/Header/NavigationMenu.module.css b/apps/system/src/Components/Header/NavigationMenu.module.css
index 1d6949f..1606f46 100644
--- a/apps/system/src/Components/Header/NavigationMenu.module.css
+++ b/apps/system/src/Components/Header/NavigationMenu.module.css
@@ -1,6 +1,8 @@
 .shell { position: relative; z-index: 1300; }
 .shell[hidden], .panel[hidden] { display: none; }
-.nav { display: flex; align-items: stretch; flex-wrap: wrap; gap: 4px; padding: 5px 10px; border-radius: var(--radius-lg); background: var(--color-primary-700); }
+.nav { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 4px; padding: 0 20px; border-radius: var(--radius-full); background: var(--background-navbar, var(--color-primary-700)); }
+.nav > a, .nav > .shortcut a { display: flex; align-items: center; gap: 8px; padding: 15px clamp(12px, 1.8vw, 30px); border-radius: var(--radius-full); color: var(--color-text-on-primary); text-decoration: none; font-weight: 500; transition: background-color .2s ease, color .2s ease; }
+.nav > a:hover, .nav > a[aria-current="page"], .nav > .shortcut a:hover, .nav > .shortcut a[aria-current="page"] { background: var(--color-surface); color: var(--color-primary-700); }
 .group { position: relative; }
 .groupButton, .shortcut a { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; padding: 9px 16px; border: 0; border-radius: var(--radius-md); background: transparent; color: var(--color-text-on-primary); font: inherit; text-decoration: none; cursor: pointer; }
 .groupButton:hover, .groupButton[aria-expanded="true"], .groupButton[data-active="true"], .shortcut a[aria-current="page"] { background: var(--color-primary-500); }
```
