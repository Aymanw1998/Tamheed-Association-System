import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// The owner's rule (2026-11-01): a player stays signed in to the sport site
// until he signs out or a sports manager signs him out of every phone.
jest.mock("../../WebServer/services/sport/functionsSport", () => ({ bumpStat: jest.fn(), deletePlayer: jest.fn(), signOutPlayer: jest.fn() }));
let mockConfirm = true;
jest.mock("../Provides/confirmBus", () => ({ ask: () => Promise.resolve(mockConfirm) }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success() {}, warn() {}, error() {} } }));
jest.mock("../../locks/useLiveRefresh", () => () => {});
jest.mock("../../locks/withLock", () => (key, fn) => fn());
jest.mock("./AddPlayerDialog", () => () => null);
jest.mock("./PlayerCardModal", () => ({ __esModule: true, default: () => null, Silhouette: () => null }));

import { signOutPlayer } from "../../WebServer/services/sport/functionsSport";
import PlayersTab from "./PlayersTab";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const PLAYER = { studentId: "s1", tz: "100000009", firstname: "لاعب", lastname: "أول", lessons: [], values: {} };
let container, root;
const mount = async (props) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><PlayersTab sport={{ stats: [] }} players={[PLAYER]} lessons={[]} reload={() => {}} {...props} /></I18nProvider>
  ));
};
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const button = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "تسجيل الخروج");

test("a sports manager signs a player out of every phone, after confirming", async () => {
  mockConfirm = true;
  signOutPlayer.mockResolvedValue({ ok: true });
  await mount({ canCoach: true, canManage: true });
  await act(async () => button().click());
  expect(signOutPlayer).toHaveBeenCalledWith("s1");
});

test("cancelling signs nobody out", async () => {
  mockConfirm = false;
  await mount({ canCoach: true, canManage: true });
  await act(async () => button().click());
  expect(signOutPlayer).not.toHaveBeenCalled();
});

test("a coach without sports.manage has no sign-out button", async () => {
  await mount({ canCoach: true, canManage: false });
  expect(button()).toBeUndefined();
});
