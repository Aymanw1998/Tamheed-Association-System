import { confirmLeave, needsLeaveConfirm, setUnsavedChanges } from "./unsavedChanges";

afterEach(() => setUnsavedChanges(null));

describe("needsLeaveConfirm", () => {
  test("only edit pages ask, unless they report nothing to lose", () => {
    for (const path of ["/students/new", "/students/abc/edit", "/users/new", "/users/abc/edit", "/lessons/new", "/lessons/1/edit", "/reports/new", "/weekly-tasks/manage", "/vehicles/v1", "/subs/new", "/selectSubfor/x", "/regnextmonth"]) {
      expect(needsLeaveConfirm(path, true)).toBe(true);
      expect(needsLeaveConfirm(path, null)).toBe(true);
      expect(needsLeaveConfirm(path, false)).toBe(false);
    }
    // The read-only record pages hold no edits: leaving them never asks.
    for (const path of ["/", "/students", "/users", "/dashboard", "/students/a/b", "/students/abc", "/users/abc", "/lessons/1", ""]) {
      expect(needsLeaveConfirm(path, true)).toBe(false);
    }
  });

  test("defaults to the state the page reported", () => {
    expect(needsLeaveConfirm("/association-rules", true)).toBe(true);
    expect(needsLeaveConfirm("/association-rules", false)).toBe(false);
    setUnsavedChanges(false);
    expect(needsLeaveConfirm("/students/1/edit")).toBe(false);
    setUnsavedChanges(true);
    expect(needsLeaveConfirm("/students/1/edit")).toBe(true);
  });
});

describe("confirmLeave", () => {
  test("does not ask off an edit page or with nothing to lose", async () => {
    const confirm = jest.fn();
    expect(await confirmLeave("/dashboard", confirm)).toBe(true);
    setUnsavedChanges(false);
    expect(await confirmLeave("/students/1/edit", confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  test("asks with the navigate preset and follows the answer", async () => {
    setUnsavedChanges(true);
    const yes = jest.fn().mockResolvedValue(true);
    const no = jest.fn().mockResolvedValue(false);
    expect(await confirmLeave("/students/1/edit", yes)).toBe(true);
    expect(await confirmLeave("/students/1/edit", no)).toBe(false);
    expect(yes).toHaveBeenCalledWith("navigate");
    expect(no).toHaveBeenCalledWith("navigate");
  });

  test("a page that does not report (null) still asks", async () => {
    const no = jest.fn().mockResolvedValue(false);
    expect(await confirmLeave("/users/new", no)).toBe(false);
    expect(no).toHaveBeenCalledTimes(1);
  });
});
