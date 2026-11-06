import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import GreetingDialog, { DEFAULT_GREETING } from "./GreetingDialog";
import { sendGreeting } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
jest.mock("../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx", () => ({ sendGreeting: jest.fn() }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const guides = [{ id: "guide", name: "Guide" }, { id: "assistant", name: "Assistant" }];
beforeEach(() => { jest.clearAllMocks(); host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const mount = () => act(async () => root.render(<GreetingDialog guides={guides} onClose={() => {}} />));
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

test("management edits the default text and sends only to the selected owner; mail failures are visible", async () => {
  sendGreeting.mockResolvedValue({ ok: true, deliveries: [{ guideId: "assistant", notified: true, email: "failed" }] });
  await mount();
  expect(host.querySelector("textarea").value).toBe(DEFAULT_GREETING);
  expect(button("إرسال").disabled).toBe(true);
  await act(async () => host.querySelectorAll('input[type="checkbox"]')[1].click());
  await act(async () => Simulate.change(host.querySelector("textarea"), { target: { value: "شكراً لكم" } }));
  await act(async () => button("إرسال").click());
  expect(sendGreeting).toHaveBeenCalledWith(expect.objectContaining({ guideIds: ["assistant"], text: "شكراً لكم", requestId: expect.any(String) }));
  expect(host.textContent).toContain("تعذّر إرسال البريد");
  expect(host.textContent).toContain("وصل التنبيه");
});

test("retry after a lost HTTP response reuses the same receipt id", async () => {
  sendGreeting.mockResolvedValueOnce({ ok: false, message: "offline" }).mockResolvedValueOnce({ ok: true, deliveries: [{ guideId: "guide", notified: true, email: "sent" }, { guideId: "assistant", notified: true, email: "missing" }] });
  await mount();
  await act(async () => button("اختيار الجميع").click());
  await act(async () => button("إرسال").click());
  await act(async () => button("إرسال").click());
  expect(sendGreeting.mock.calls[0][0]).toEqual(sendGreeting.mock.calls[1][0]);
  expect(host.textContent).toContain("لا يوجد بريد شخصي");
});

test("an in-flight receipt can be checked again without sending a new greeting", async () => {
  sendGreeting.mockResolvedValueOnce({ ok: true, deliveries: [{ guideId: "guide", notified: false, email: "pending" }] })
    .mockResolvedValueOnce({ ok: true, deliveries: [{ guideId: "guide", notified: true, email: "sent" }] });
  await mount();
  await act(async () => host.querySelector('input[type="checkbox"]').click());
  await act(async () => button("إرسال").click());
  await act(async () => button("التحقق من الإرسال").click());
  expect(sendGreeting.mock.calls[0][0]).toEqual(sendGreeting.mock.calls[1][0]);
  expect(host.textContent).toContain("أُرسل البريد");
});
