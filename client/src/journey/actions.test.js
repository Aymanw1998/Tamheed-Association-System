import { isJourneyEvent, runAction } from "./actions";

const byTour = (target) => document.querySelector(`[data-tour="${target}"]`);

afterEach(() => {
  document.body.innerHTML = "";
});

test("type sets the value character by character through the native setter", async () => {
  document.body.innerHTML = '<input data-tour="name" />';
  const input = byTour("name");
  // Like React: an own value property hides the prototype setter, so writing
  // `input.value = ...` would not be seen; only the native setter is.
  let tracked = "";
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => tracked,
    set: (v) => {
      tracked = v;
    },
  });
  const seen = [];
  input.addEventListener("input", (event) => seen.push(event.target === input && Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").get.call(input)));

  await runAction({ type: "type", target: "name", value: "أحمد" }, { find: byTour, charDelay: 0 });

  expect(seen).toEqual(["أ", "أح", "أحم", "أحمد"]);
});

test("type works on a textarea and replaces any earlier text", async () => {
  document.body.innerHTML = '<textarea data-tour="body">قديم</textarea>';
  const seen = [];
  byTour("body").addEventListener("input", (event) => seen.push(event.target.value));
  await runAction({ type: "type", target: "body", value: "نص" }, { find: byTour, charDelay: 0 });
  expect(seen).toEqual(["ن", "نص"]);
});

test("click events carry __journey", async () => {
  document.body.innerHTML = '<button data-tour="save">حفظ</button>';
  const seen = [];
  byTour("save").addEventListener("click", (event) => seen.push(event.__journey === true && isJourneyEvent(event)));
  await runAction({ type: "click", target: "save" }, { find: byTour });
  expect(seen).toEqual([true]);
});

test("a submit fired by a journey click counts as a journey event", async () => {
  document.body.innerHTML = '<form><button type="submit" data-tour="send">حفظ</button></form>';
  const seen = [];
  document.querySelector("form").addEventListener("submit", (event) => {
    event.preventDefault();
    seen.push(isJourneyEvent(event));
  });
  await runAction({ type: "click", target: "send" }, { find: byTour });
  expect(seen).toEqual([true]);
  // Outside a journey action a plain event is not one.
  expect(isJourneyEvent(new Event("submit"))).toBe(false);
});

test("select sets the option and dispatches change", async () => {
  document.body.innerHTML = '<select data-tour="role"><option value="a">أ</option><option value="b">ب</option></select>';
  const seen = [];
  byTour("role").addEventListener("change", (event) => seen.push(event.target.value));
  await runAction({ type: "select", target: "role", value: "b" }, { find: byTour });
  expect(seen).toEqual(["b"]);
});

test("a missing target rejects TARGET_MISSING", async () => {
  await expect(runAction({ type: "click", target: "nowhere" }, { find: byTour, timeout: 30 })).rejects.toThrow("TARGET_MISSING");
  await expect(runAction({ type: "type", target: "nowhere", value: "x" }, { find: byTour, timeout: 30 })).rejects.toMatchObject({ code: "TARGET_MISSING" });
});

test("a target that appears a moment later is still found", async () => {
  setTimeout(() => {
    document.body.innerHTML = '<button data-tour="late">فتح</button>';
  }, 20);
  const clicked = jest.fn();
  document.addEventListener("click", clicked);
  await runAction({ type: "click", target: "late" }, { find: byTour, timeout: 500 });
  document.removeEventListener("click", clicked);
  expect(clicked).toHaveBeenCalledTimes(1);
});

test("cancelConfirm clicks the cancel button of the open confirm dialog", async () => {
  document.body.innerHTML = `
    <div class="c-overlay" role="dialog" aria-modal="true">
      <div class="c-actions">
        <button class="c-btn" data-confirm="cancel">إلغاء</button>
        <button class="c-btn" data-confirm="ok">حذف</button>
      </div>
    </div>`;
  const seen = [];
  document.querySelectorAll("button").forEach((b) => b.addEventListener("click", (e) => seen.push(`${b.dataset.confirm}:${e.__journey}`)));
  await runAction({ type: "cancelConfirm" }, { find: byTour });
  expect(seen).toEqual(["cancel:true"]);
});

test("cancelConfirm with no dialog rejects TARGET_MISSING", async () => {
  await expect(runAction({ type: "cancelConfirm" }, { find: byTour, timeout: 30 })).rejects.toThrow("TARGET_MISSING");
});

test("navigate calls navigate with the path; wait waits", async () => {
  const navigate = jest.fn();
  await runAction({ type: "navigate", path: "/students" }, { navigate, find: byTour });
  expect(navigate).toHaveBeenCalledWith("/students");
  const started = Date.now();
  await runAction({ type: "wait", ms: 30 }, { find: byTour });
  expect(Date.now() - started).toBeGreaterThanOrEqual(25);
});

test("an unknown action type rejects", async () => {
  await expect(runAction({ type: "dance" }, { find: byTour })).rejects.toThrow("UNKNOWN_ACTION");
});

test("a cancelled wait never clicks a target that shows up afterwards", async () => {
  let stop = false;
  const clicked = jest.fn();
  const pending = runAction({ type: "click", target: "later" }, { find: byTour, timeout: 1000, cancelled: () => stop });
  stop = true;
  document.body.innerHTML = '<button data-tour="later">حفظ</button>';
  byTour("later").addEventListener("click", clicked);
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  await new Promise((r) => setTimeout(r, 150));
  expect(clicked).not.toHaveBeenCalled();
});

test("typing stops at the next character once cancelled", async () => {
  document.body.innerHTML = '<input data-tour="name" />';
  const seen = [];
  let stop = false;
  byTour("name").addEventListener("input", (event) => {
    seen.push(event.target.value);
    if (event.target.value.length === 2) stop = true;
  });
  await expect(runAction({ type: "type", target: "name", value: "أحمد" }, { find: byTour, charDelay: 0, cancelled: () => stop }))
    .rejects.toThrow("CANCELLED");
  expect(seen).toEqual(["أ", "أح"]);
});

test("an action cancelled before it starts does nothing", async () => {
  const navigate = jest.fn();
  await expect(runAction({ type: "navigate", path: "/x" }, { navigate, cancelled: () => true })).rejects.toThrow("CANCELLED");
  expect(navigate).not.toHaveBeenCalled();
});

test("a target shown twice (desktop and phone layouts) resolves to the visible one", async () => {
  const { findTarget } = require("./actions");
  document.body.innerHTML = '<button data-tour="open" id="desk"></button><button data-tour="open" id="phone"></button>';
  const phone = document.getElementById("phone");
  const rects = jest.spyOn(Element.prototype, "getClientRects").mockImplementation(function rectsOf() {
    return this === phone ? [{}] : [];
  });
  try {
    expect(findTarget("open").id).toBe("phone");
    expect(findTarget("open", { visibleOnly: true }).id).toBe("phone");
    const clicked = [];
    document.body.addEventListener("click", (e) => clicked.push(e.target.id));
    await runAction({ type: "click", target: "open" }, {});
    expect(clicked).toEqual(["phone"]);
  } finally {
    rects.mockRestore();
  }
});

test("with nothing laid out, the first element is used, and visibleOnly finds none", () => {
  const { findTarget } = require("./actions");
  document.body.innerHTML = '<button data-tour="open" id="a"></button><button data-tour="open" id="b"></button>';
  expect(findTarget("open").id).toBe("a");
  expect(findTarget("open", { visibleOnly: true })).toBeNull();
});

test("a target shown twice (desktop and phone layouts) resolves to the visible one", async () => {
  const { findTarget } = require("./actions");
  document.body.innerHTML = '<button data-tour="open" id="desk"></button><button data-tour="open" id="phone"></button>';
  const phone = document.getElementById("phone");
  const rects = jest.spyOn(Element.prototype, "getClientRects").mockImplementation(function rectsOf() {
    return this === phone ? [{}] : [];
  });
  try {
    expect(findTarget("open").id).toBe("phone");
    expect(findTarget("open", { visibleOnly: true }).id).toBe("phone");
    const clicked = [];
    document.body.addEventListener("click", (e) => clicked.push(e.target.id));
    await runAction({ type: "click", target: "open" }, {});
    expect(clicked).toEqual(["phone"]);
  } finally {
    rects.mockRestore();
  }
});

test("with nothing laid out, the first element is used, and visibleOnly finds none", () => {
  const { findTarget } = require("./actions");
  document.body.innerHTML = '<button data-tour="open" id="a"></button><button data-tour="open" id="b"></button>';
  expect(findTarget("open").id).toBe("a");
  expect(findTarget("open", { visibleOnly: true })).toBeNull();
});
