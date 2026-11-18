import React, { act } from "react";
import { createRoot } from "react-dom/client";
import TrashPage from "./TrashPage";
import { listTrash, purgeTrash, restoreTrash } from "../../WebServer/services/trash/functionsTrash.jsx";
import { ask } from "../Provides/confirmBus";
import { offerUndo, UNDO_MS } from "../../utils/undoDelete";
import { toast } from "../../ALERT/SystemToasts";
import { canAccessPath } from "../../utils/routeAccess";

// «سلة المحذوفات» (owner, 2026-11-16).
jest.mock("../../WebServer/services/trash/functionsTrash.jsx", () => ({ listTrash: jest.fn(), purgeTrash: jest.fn(), restoreTrash: jest.fn() }));
jest.mock("../Provides/confirmBus", () => ({ ask: jest.fn() }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const ITEM = { id: "t1", kind: "student", label: "Example Student", deletedAt: "2026-11-16T08:00:00Z", deletedBy: "Ad Min", expiresAt: "2026-12-16T08:00:00Z", canPurge: true };
beforeEach(() => {
  listTrash.mockResolvedValue({ ok: true, items: [ITEM] });
  restoreTrash.mockResolvedValue({ ok: true });
  purgeTrash.mockResolvedValue({ ok: true });
});
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); jest.clearAllMocks(); });

const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<TrashPage />));
};
const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(text));

test("lists what was deleted, and restores one", async () => {
  await mount();
  expect(host.textContent).toContain("Example Student");
  expect(host.textContent).toContain("طالب");
  expect(host.textContent).toContain("Ad Min");
  await act(async () => button("استعادة").click());
  expect(restoreTrash).toHaveBeenCalledWith("t1");
  expect(listTrash).toHaveBeenCalledTimes(2);
});

test("a delete for good asks first, and does nothing when cancelled", async () => {
  await mount();
  ask.mockResolvedValueOnce(false);
  await act(async () => button("حذف نهائي").click());
  expect(purgeTrash).not.toHaveBeenCalled();
  ask.mockResolvedValueOnce(true);
  await act(async () => button("حذف نهائي").click());
  expect(purgeTrash).toHaveBeenCalledWith("t1");
});

test("without the purge key there is no delete for good (owner, 2026-11-18)", async () => {
  listTrash.mockResolvedValue({ ok: true, items: [{ ...ITEM, canPurge: false }] });
  await mount();
  expect(button("استعادة")).toBeTruthy();
  expect(button("حذف نهائي")).toBeUndefined();
});

test("an empty bin says so", async () => {
  listTrash.mockResolvedValue({ ok: true, items: [] });
  await mount();
  expect(host.textContent).toContain("سلة المحذوفات فارغة");
});

test("after a delete the toast offers تراجع for 8 seconds, which restores", async () => {
  const restored = jest.fn();
  offerUndo({ trashId: "t9", message: "moved", onRestored: restored });
  const [, opts] = toast.success.mock.calls[0];
  expect(UNDO_MS).toBe(8000);
  expect(opts.duration).toBe(8000);
  expect(opts.action.label).toBe("تراجع");
  await opts.action.onClick();
  expect(restoreTrash).toHaveBeenCalledWith("t9");
  expect(restored).toHaveBeenCalled();
});

test("the page opens with any one of the delete keys", () => {
  expect(canAccessPath("/trash", ["vehicles.delete"])).toBe(true);
  expect(canAccessPath("/trash", ["students.view"])).toBe(false);
});
