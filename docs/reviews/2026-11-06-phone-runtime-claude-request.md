# Independent review request: phone navigation and two runtime patches

Codex implements; actual Claude Code reviews without editing. Review only this
source payload. Do not run tools, inspect files, open another review, or access
real services, user records or environment data.

Owner requests the former phone menu appearance restored or a cleaner design,
and direct handling of the deployment warnings. This patch restores a rounded
dark dropdown below the phone header while preserving grouped permissions and
program-first links. Account-menu clicks dismiss it; keyboard focus wraps,
Escape, explicit close and route changes dismiss it. Actual header geometry
limits its internal scrolling. Desktop grouping remains as before.

Two locked server patches address GHSA-27r3-jxmh-p828 (body-parser 1.20.9)
and GHSA-mrwp-f3q8-3g9p (follow-redirects 1.16.2). No declared dependencies or
unrelated lock records change. No force audit fix or broad CRA upgrade.

Please report concrete bugs, accessibility or regression risks with file/line
and a failure scenario, or explicitly say no findings. Local focused Header
checks passed (21 tests); synthetic actual-component browser rendering checked
at 320, 375, 667 landscape and 1280 desktop. Full verify is in progress. This
request contains only source and synthetic test code, no runtime logs.

## Patch

```diff
diff --git a/apps/system/src/Components/Header/Header.test.js b/apps/system/src/Components/Header/Header.test.js
index ab4fe4e..a020f8b 100644
--- a/apps/system/src/Components/Header/Header.test.js
+++ b/apps/system/src/Components/Header/Header.test.js
@@ -140,7 +140,7 @@ test("desktop groups open on click and ArrowDown, close on Escape/outside, and m
   await act(async () => document.body.click());
   expect(people.getAttribute("aria-expanded")).toBe("false");
 });
-test("mobile drawer expands groups, closes after navigation and returns focus to its toggle", async () => {
+test("phone dropdown expands groups, closes after navigation and returns focus to its toggle", async () => {
   window.innerWidth = 375;
   await mount();
   const toggle = host.querySelector('[data-tour="menu-toggle"]');
@@ -158,6 +158,34 @@ test("mobile drawer expands groups, closes after navigation and returns focus to
   await act(async () => host.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
   expect(document.body.style.overflow).not.toBe("hidden");
 });
+test("phone menu wraps keyboard focus and closes when the account menu is opened", async () => {
+  window.innerWidth = 375;
+  await mount();
+  const toggle = host.querySelector('[data-tour="menu-toggle"]');
+  await act(async () => toggle.click());
+  const menu = host.querySelector('[role="dialog"]');
+  const controls = [...menu.querySelectorAll("a,button")].filter((node) => !node.closest("[hidden]"));
+  const first = controls[0], last = controls[controls.length - 1];
+  last.focus();
+  await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
+  expect(document.activeElement).toBe(first);
+  await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
+  expect(document.activeElement).toBe(last);
+  await act(async () => accountButton().click());
+  expect(host.querySelector('[role="dialog"]')).toBeNull();
+  expect(accountMenu()).not.toBeNull();
+  expect(document.body.style.overflow).not.toBe("hidden");
+});
+test("the phone close control restores the menu toggle and page scrolling", async () => {
+  window.innerWidth = 375;
+  await mount();
+  const toggle = host.querySelector('[data-tour="menu-toggle"]');
+  await act(async () => toggle.click());
+  await act(async () => host.querySelector('[aria-label="إغلاق القائمة"]').click());
+  expect(toggle.getAttribute("aria-expanded")).toBe("false");
+  expect(document.activeElement).toBe(toggle);
+  expect(document.body.style.overflow).not.toBe("hidden");
+});
 test("groups with no permitted pages are absent", async () => {
   mockPerms = [];
   await mount();
diff --git a/apps/system/src/Components/Header/NavigationMenu.jsx b/apps/system/src/Components/Header/NavigationMenu.jsx
index 0b32859..efc1f86 100644
--- a/apps/system/src/Components/Header/NavigationMenu.jsx
+++ b/apps/system/src/Components/Header/NavigationMenu.jsx
@@ -13,10 +13,15 @@ export default function NavigationMenu({ groups, program, mobile, open, onClose,
   const [expanded, setExpanded] = useState(mobile ? activeGroup : null);
   useEffect(() => { setExpanded(mobile ? activeGroup : null); onClose(); }, [pathname, mobile]); // close after route changes
   useEffect(() => {
-    const outside = (event) => { if (nav.current && !nav.current.contains(event.target)) setExpanded(null); };
+    const outside = (event) => {
+      if (nav.current && !nav.current.contains(event.target)) {
+        setExpanded(null);
+        if (mobile && open) onClose();
+      }
+    };
     document.addEventListener("click", outside);
     return () => document.removeEventListener("click", outside);
-  }, []);
+  }, [mobile, open, onClose]);
   useEffect(() => {
     if (!mobile || !open) return undefined;
     setExpanded(activeGroup);
@@ -24,7 +29,18 @@ export default function NavigationMenu({ groups, program, mobile, open, onClose,
     nav.current?.querySelector("button")?.focus();
     const previousOverflow = document.body.style.overflow;
     document.body.style.overflow = "hidden";
-    return () => { document.body.style.overflow = previousOverflow; previous?.focus?.(); };
+    // The old phone layout opens below the header. Measure its actual bottom:
+    // long names, landscape and text zoom must leave the menu scrollable.
+    const header = nav.current?.closest("header");
+    const measure = () => nav.current?.style.setProperty("--navigation-header-bottom", `${header?.getBoundingClientRect().bottom || 120}px`);
+    measure();
+    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
+    if (header) observer?.observe(header);
+    window.addEventListener("resize", measure);
+    return () => {
+      observer?.disconnect(); window.removeEventListener("resize", measure);
+      document.body.style.overflow = previousOverflow; previous?.focus?.();
+    };
   }, [mobile, open]);

   const link = (item) => <a key={item.path} href={item.path} data-tour={item.tour}
@@ -49,11 +65,11 @@ export default function NavigationMenu({ groups, program, mobile, open, onClose,

   return <>
     {mobile && open && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
-    <div ref={nav} className={`${styles.shell} ${mobile ? styles.drawer : ""}`} hidden={mobile && !open}
+    <div ref={nav} className={`${styles.shell} ${mobile ? styles.mobileMenu : ""}`} hidden={mobile && !open}
       role={mobile && open ? "dialog" : undefined} aria-modal={mobile && open ? "true" : undefined}
       aria-label={mobile ? "القائمة الرئيسية" : undefined} onKeyDown={onKey}
       onBlur={(event) => { if (!mobile && !event.currentTarget.contains(event.relatedTarget)) setExpanded(null); }}>
-      {mobile && <div className={styles.drawerHead}><strong>القائمة الرئيسية</strong><button type="button" onClick={onClose} aria-label="إغلاق القائمة">×</button></div>}
+      {mobile && <div className={styles.menuHeading}><strong>القائمة الرئيسية</strong><button type="button" onClick={onClose} aria-label="إغلاق القائمة">×</button></div>}
       <nav id="main-nav" data-tour="menu" aria-label="التنقل الرئيسي" className={styles.nav}>
         {program && <div className={styles.shortcut}>{link(program)}</div>}
         {groups.map((group) => <div key={group.id} className={styles.group}>
diff --git a/apps/system/src/Components/Header/NavigationMenu.module.css b/apps/system/src/Components/Header/NavigationMenu.module.css
index 1cb9141..1d6949f 100644
--- a/apps/system/src/Components/Header/NavigationMenu.module.css
+++ b/apps/system/src/Components/Header/NavigationMenu.module.css
@@ -7,12 +7,92 @@
 .panel { position: absolute; inset-inline-start: 0; top: calc(100% + 5px); min-width: 200px; padding: 6px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); box-shadow: var(--shadow-lg); }
 .panel a { display: flex; gap: 8px; align-items: center; min-height: 44px; padding: 10px 12px; border-radius: var(--radius-md); color: var(--color-text-primary); text-decoration: none; }
 .panel a:hover, .panel a[aria-current="page"] { background: var(--color-primary-100); color: var(--color-primary-700); }
-.nav a:focus-visible, .nav button:focus-visible, .drawerHead button:focus-visible { outline: 2px solid var(--color-accent-500); outline-offset: 2px; }
-.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 1500; }
-.drawer { position: fixed; inset-block: 0; inset-inline-start: 0; width: min(340px, 90vw); overflow-y: auto; background: var(--color-surface); z-index: 1501; box-shadow: var(--shadow-lg); padding: env(safe-area-inset-top, 0px) 12px env(safe-area-inset-bottom, 0px); }
-.drawerHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; color: var(--color-text-primary); }
-.drawerHead button { min-width: 44px; min-height: 44px; font: inherit; font-size: 24px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-primary); cursor: pointer; }
-.drawer .nav { display: flex; flex-direction: column; align-items: stretch; padding: 0; background: var(--color-surface); }
-.drawer .groupButton, .drawer .shortcut a { width: 100%; color: var(--color-text-primary); }
-.drawer .groupButton[data-active="true"], .drawer .groupButton[aria-expanded="true"], .drawer .shortcut a[aria-current="page"] { background: var(--color-primary-100); color: var(--color-primary-700); }
-.drawer .panel { position: static; min-width: 0; padding: 0 12px; border: 0; box-shadow: none; border-inline-start: 2px solid var(--color-border); margin: 4px 12px 10px; }
+.nav a:focus-visible, .nav button:focus-visible, .menuHeading button:focus-visible { outline: 2px solid var(--color-accent-500); outline-offset: 2px; }
+
+/* Restore the original phone menu: a rounded dark panel under the header. */
+.backdrop {
+  position: fixed;
+  inset: 0;
+  background: rgba(3, 3, 3, .35);
+  backdrop-filter: blur(4px);
+  z-index: 1200;
+}
+.mobileMenu {
+  position: absolute;
+  inset-inline: 12px;
+  top: calc(100% + 8px);
+  max-height: max(88px, calc(100dvh - var(--navigation-header-bottom, 120px) - 24px - env(safe-area-inset-bottom, 0px)));
+  overflow-y: auto;
+  overscroll-behavior: contain;
+  padding: 8px 12px 12px;
+  border-radius: 18px;
+  background: var(--background-navbar, var(--color-primary-700));
+  color: var(--color-text-on-primary);
+  box-shadow: 0 18px 35px rgba(15, 23, 42, .24);
+  z-index: 1501;
+  animation: phoneMenuAppear .18s ease-out;
+}
+.menuHeading {
+  display: flex;
+  align-items: center;
+  justify-content: space-between;
+  gap: 12px;
+  padding: 4px 4px 8px;
+}
+.menuHeading strong { font-size: .95rem; font-weight: 600; }
+.menuHeading button {
+  min-width: 44px;
+  min-height: 44px;
+  border: 1px solid rgba(255, 255, 255, .3);
+  border-radius: 12px;
+  background: rgba(255, 255, 255, .1);
+  color: inherit;
+  font: inherit;
+  font-size: 24px;
+  cursor: pointer;
+}
+.mobileMenu .nav {
+  flex-direction: column;
+  align-items: stretch;
+  flex-wrap: nowrap;
+  gap: 0;
+  padding: 0;
+  background: transparent;
+}
+.mobileMenu .group { border-bottom: 1px solid rgba(255, 255, 255, .15); }
+.mobileMenu .group:last-child { border-bottom: 0; }
+.mobileMenu .shortcut { margin-bottom: 6px; }
+.mobileMenu .groupButton, .mobileMenu .shortcut a {
+  width: 100%;
+  min-height: 48px;
+  padding: 14px 12px;
+  border-radius: 12px;
+  color: inherit;
+  font-weight: 600;
+  text-align: start;
+}
+.mobileMenu .groupButton:hover,
+.mobileMenu .groupButton[data-active="true"],
+.mobileMenu .groupButton[aria-expanded="true"] { background: rgba(255, 255, 255, .12); }
+.mobileMenu .panel {
+  position: static;
+  min-width: 0;
+  padding: 0 6px;
+  margin: 4px 10px 12px;
+  border: 0;
+  border-inline-start: 2px solid rgba(255, 255, 255, .25);
+  border-radius: 0;
+  background: transparent;
+  box-shadow: none;
+}
+.mobileMenu .panel a { padding: 12px; color: var(--color-text-on-primary); }
+.mobileMenu .panel a:hover { background: rgba(255, 255, 255, .12); }
+.mobileMenu .shortcut a[aria-current="page"],
+.mobileMenu .panel a[aria-current="page"] { background: var(--color-surface); color: var(--color-primary-700); }
+@keyframes phoneMenuAppear {
+  from { opacity: 0; transform: translateY(-8px); }
+  to { opacity: 1; transform: translateY(0); }
+}
+@media (prefers-reduced-motion: reduce) {
+  .mobileMenu { animation: none; }
+}
diff --git a/server/package-lock.json b/server/package-lock.json
index 3f22ffc..8daf28c 100644
--- a/server/package-lock.json
+++ b/server/package-lock.json
@@ -1264,9 +1264,9 @@
       "license": "MIT"
     },
     "node_modules/body-parser": {
-      "version": "1.20.8",
-      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-1.20.8.tgz",
-      "integrity": "sha512-JNcyFQ64OiijEkPzUBTCe+hyPXUD/3LEldGQ6iF5LR1w00mx9o7xtDWHXBY2iItjdCFGoilOLNQbH943ut7pHA==",
+      "version": "1.20.9",
+      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-1.20.9.tgz",
+      "integrity": "sha512-FISIQxV5u91Y9gvuFq3q/tA/qTqLJn3AhRcEvyozyhJTh5OBFFtv827AdHU7Rbyct4r+Ba1/99oFa1Y3yuFsdw==",
       "license": "MIT",
       "dependencies": {
         "bytes": "~3.1.2",
@@ -2013,9 +2013,9 @@
       }
     },
     "node_modules/follow-redirects": {
-      "version": "1.16.1",
-      "resolved": "https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.16.1.tgz",
-      "integrity": "sha512-FNvFGzoMLWmE6Yj9spb/zjd7yiNCHiAW9/Tg9CXrQ8wuu32HtlJOwWO11OJafl5FfY3DxTdQ0vj42zU1kvv5jg==",
+      "version": "1.16.2",
+      "resolved": "https://registry.npmjs.org/follow-redirects/-/follow-redirects-1.16.2.tgz",
+      "integrity": "sha512-/kVP2U8z596Ia0gwFrwyIeo74ta5aVmSeU1FfAUMAmcEP5EP7zydmag3SLiN64NaRKef3lxsq7i/g7ltJQDGow==",
       "funding": [
         {
           "type": "individual",
```

## Complete NavigationMenu.jsx

```jsx
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import NewBadge from "../../tours/NewBadge";
import styles from "./NavigationMenu.module.css";

const activeAt = (item, path) => item.path === "/lessons" ? /^\/(lessons|calendar)(\/|$)/.test(path) : path === item.path || path.startsWith(`${item.path}/`);

export default function NavigationMenu({ groups, program, mobile, open, onClose, onNav }) {
  const { pathname } = useLocation();
  const nav = useRef(null);
  const triggers = useRef({});
  const activeGroup = groups.find((group) => group.items.some((item) => activeAt(item, pathname)))?.id || null;
  const [expanded, setExpanded] = useState(mobile ? activeGroup : null);
  useEffect(() => { setExpanded(mobile ? activeGroup : null); onClose(); }, [pathname, mobile]); // close after route changes
  useEffect(() => {
    const outside = (event) => {
      if (nav.current && !nav.current.contains(event.target)) {
        setExpanded(null);
        if (mobile && open) onClose();
      }
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [mobile, open, onClose]);
  useEffect(() => {
    if (!mobile || !open) return undefined;
    setExpanded(activeGroup);
    const previous = document.querySelector('[data-tour="menu-toggle"]') || document.activeElement;
    nav.current?.querySelector("button")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The old phone layout opens below the header. Measure its actual bottom:
    // long names, landscape and text zoom must leave the menu scrollable.
    const header = nav.current?.closest("header");
    const measure = () => nav.current?.style.setProperty("--navigation-header-bottom", `${header?.getBoundingClientRect().bottom || 120}px`);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (header) observer?.observe(header);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect(); window.removeEventListener("resize", measure);
      document.body.style.overflow = previousOverflow; previous?.focus?.();
    };
  }, [mobile, open]);

  const link = (item) => <a key={item.path} href={item.path} data-tour={item.tour}
    aria-current={activeAt(item, pathname) ? "page" : undefined}
    onClick={(event) => { onClose(); if (!mobile) setExpanded(null); onNav(event, item.path); }}>
    {item.label}{item.badge && <NewBadge section={item.badge} />}
  </a>;

  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation();
      if (mobile) onClose();
      else { triggers.current[expanded]?.focus(); setExpanded(null); }
    }
    if (mobile && open && event.key === "Tab") {
      const elements = [...nav.current.querySelectorAll("a,button")].filter((element) => !element.closest("[hidden]") && !element.disabled);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };

  return <>
    {mobile && open && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}
    <div ref={nav} className={`${styles.shell} ${mobile ? styles.mobileMenu : ""}`} hidden={mobile && !open}
      role={mobile && open ? "dialog" : undefined} aria-modal={mobile && open ? "true" : undefined}
      aria-label={mobile ? "القائمة الرئيسية" : undefined} onKeyDown={onKey}
      onBlur={(event) => { if (!mobile && !event.currentTarget.contains(event.relatedTarget)) setExpanded(null); }}>
      {mobile && <div className={styles.menuHeading}><strong>القائمة الرئيسية</strong><button type="button" onClick={onClose} aria-label="إغلاق القائمة">×</button></div>}
      <nav id="main-nav" data-tour="menu" aria-label="التنقل الرئيسي" className={styles.nav}>
        {program && <div className={styles.shortcut}>{link(program)}</div>}
        {groups.map((group) => <div key={group.id} className={styles.group}>
          <button ref={(element) => { triggers.current[group.id] = element; }} type="button"
            className={styles.groupButton} data-active={group.id === activeGroup}
            aria-expanded={expanded === group.id} aria-controls={`nav-group-${group.id}`}
            onClick={() => setExpanded((current) => current === group.id ? null : group.id)}
            onKeyDown={(event) => { if (!mobile && event.key === "ArrowDown") { event.preventDefault(); setExpanded(group.id); requestAnimationFrame(() => nav.current?.querySelector(`#nav-group-${group.id} a`)?.focus()); } }}>
            {group.label}<span aria-hidden="true">{expanded === group.id ? "▴" : "▾"}</span>
          </button>
          <div id={`nav-group-${group.id}`} className={styles.panel} hidden={expanded !== group.id}>{group.items.map(link)}</div>
        </div>)}
      </nav>
    </div>
  </>;
}

```
