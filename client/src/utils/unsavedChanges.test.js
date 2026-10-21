import { confirmLeave, needsLeaveConfirm, setUnsavedChanges } from "./unsavedChanges";

afterEach(() => setUnsavedChanges(null));

describe("needsLeaveConfirm", () => {
  test("only edit pages ask, unless they report nothing to lose", () => {
    for (const path of ["/students/new", "/users/abc", "/lessons/1", "/vehicles/v1", "/subs/new", "/selectSubfor/x", "/regnextmonth"]) {
      expect(needsLeaveConfirm(path, true)).toBe(true);
      expect(needsLeaveConfirm(path, null)).toBe(true);
      expect(needsLeaveConfirm(path, false)).toBe(false);
    }
    for (const path of ["/", "/students", "/users", "/dashboard", "/students/a/b", ""]) {
      expect(needsLeaveConfirm(path, true)).toBe(false);
    }
  });

  test("defaults to the state the page reported", () => {
    setUnsavedChanges(false);
    expect(needsLeaveConfirm("/students/1")).toBe(false);
    setUnsavedChanges(true);
    expect(needsLeaveConfirm("/students/1")).toBe(true);
  });
});

describe("confirmLeave", () => {
  test("does not ask off an edit page or with nothing to lose", async () => {
    const confirm = jest.fn();
    expect(await confirmLeave("/dashboard", confirm)).toBe(true);
    setUnsavedChanges(false);
    expect(await confirmLeave("/students/1", confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  test("asks with the navigate preset and follows the answer", async () => {
    setUnsavedChanges(true);
    const yes = jest.fn().mockResolvedValue(true);
    const no = jest.fn().mockResolvedValue(false);
    expect(await confirmLeave("/students/1", yes)).toBe(true);
    expect(await confirmLeave("/students/1", no)).toBe(false);
    expect(yes).toHaveBeenCalledWith("navigate");
    expect(no).toHaveBeenCalledWith("navigate");
  });

  test("a page that does not report (null) still asks", async () => {
    const no = jest.fn().mockResolvedValue(false);
    expect(await confirmLeave("/users/new", no)).toBe(false);
    expect(no).toHaveBeenCalledTimes(1);
  });
});
