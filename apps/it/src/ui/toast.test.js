import { act } from "react";
import { mount, unmountAll, click, toastText } from "../testUtils";
import { toast } from "./toast.jsx";

afterEach(unmountAll);

test("toast: a success shows as status, an error as alert, × closes it", async () => {
  await mount(<p>page</p>);
  await act(async () => { toast.success("تم الحفظ"); toast.error("تعذّر الحفظ"); });
  expect(document.body.querySelector("[role=status]").textContent).toContain("تم الحفظ");
  expect(document.body.querySelector("[role=alert]").textContent).toContain("تعذّر الحفظ");
  await click(document.body.querySelector("[role=alert] button[aria-label='إغلاق']"));
  expect(toastText()).not.toContain("تعذّر الحفظ");
  expect(toastText()).toContain("تم الحفظ");
});

test("toast: closes by itself after its time", async () => {
  jest.useFakeTimers();
  try {
    await mount(<p>page</p>);
    await act(async () => { toast.success("تم الحفظ"); });
    await act(async () => { jest.advanceTimersByTime(5200); });
    expect(toastText()).not.toContain("تم الحفظ");
  } finally {
    jest.useRealTimers();
  }
});
