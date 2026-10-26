import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useLockRecovery, LOCK_LOST_MESSAGES } from "./LockLostBanner";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container, root, setLock;
const reload = jest.fn();
function Screen({ initial }) {
  const [lock, set] = useState(initial);
  setLock = set;
  const recovery = useLockRecovery(lock, { reload, draft: "نص مكتوب" });
  // Like the edit screens: a loading view while the lock resolves.
  if (lock.status === "loading") return <div>loading{recovery.element}</div>;
  return <div>{recovery.element}<p>form</p></div>;
}
const mount = async (lock) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Screen initial={lock} />));
};
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  reload.mockReset();
});

test.each([
  ["forced", "حرّر المدير القفل. التعديلات غير المحفوظة ما زالت ظاهرة."],
  ["expired", "انتهت مدة القفل بسبب انقطاع الاتصال."],
  ["idle", "حُرّر القفل بسبب عدم النشاط."],
])("a %s lock shows its banner and «استعادة التحرير»", async (reason, text) => {
  expect(LOCK_LOST_MESSAGES[reason]).toBe(text);
  await mount({ status: "readonly", reason, retry: jest.fn() });
  expect(container.textContent).toContain(text);
  expect(container.textContent).toContain("استعادة التحرير");
});

test("«استعادة التحرير» retries; once held it reloads the item and keeps the draft to copy", async () => {
  const retry = jest.fn();
  await mount({ status: "readonly", reason: "forced", retry });
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent === "استعادة التحرير");
  await act(async () => button.click());
  expect(retry).toHaveBeenCalledTimes(1);
  await act(async () => setLock({ status: "loading", reason: null, retry }));
  expect(reload).not.toHaveBeenCalled();
  await act(async () => setLock({ status: "held", reason: null, retry }));
  expect(reload).toHaveBeenCalledTimes(1);
  expect(container.textContent).not.toContain("حرّر المدير القفل");
  expect(container.querySelector("textarea").value).toBe("نص مكتوب");
});

test("nothing shows while the lock is held normally", async () => {
  await mount({ status: "held", reason: null, retry: jest.fn() });
  expect(container.textContent).toBe("form");
});
