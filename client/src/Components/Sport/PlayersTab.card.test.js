import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

// Sign-in card (owner, 2026-11-01): young players have no email, so a sports
// manager prints a card with a QR code that signs the phone in.
jest.mock("../../WebServer/services/sport/functionsSport", () => ({
  bumpStat: jest.fn(), deletePlayer: jest.fn(), signOutPlayer: jest.fn(), issueLoginCard: jest.fn(),
}));
let mockConfirm = true;
const mockAsked = [];
jest.mock("../Provides/confirmBus", () => ({ ask: (kind, opts) => { mockAsked.push(opts); return Promise.resolve(mockConfirm); } }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success() {}, warn() {}, error() {} } }));
jest.mock("../../locks/useLiveRefresh", () => () => {});
jest.mock("../../locks/withLock", () => (key, fn) => fn());
jest.mock("./AddPlayerDialog", () => () => null);
jest.mock("./PlayerCardModal", () => ({ __esModule: true, default: () => null, Silhouette: () => null }));

import { issueLoginCard } from "../../WebServer/services/sport/functionsSport";
import PlayersTab from "./PlayersTab";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;

const PLAYER = { studentId: "s1", tz: "100000009", firstname: "لاعب", lastname: "أول", lessons: [], values: {}, cardIssuedAt: null };
const CARD = { ok: true, url: "https://sport.test/#card=abc", svg: '<svg data-testid="qr"></svg>' };
let container, root;
const mount = async (props, player = PLAYER) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(
    <I18nProvider><PlayersTab sport={{ stats: [] }} players={[player]} lessons={[]} reload={() => {}} {...props} /></I18nProvider>
  ));
};
beforeEach(() => { mockConfirm = true; mockAsked.length = 0; issueLoginCard.mockImplementation(() => Promise.resolve(CARD)); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
const button = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "بطاقة الدخول");

test("a sports manager prints a first card straight away: the QR with the player's name", async () => {
  await mount({ canCoach: true, canManage: true });
  await act(async () => button().click());
  expect(mockAsked).toHaveLength(0);
  expect(issueLoginCard).toHaveBeenCalledWith("s1");
  const card = container.querySelector('[data-testid="login-card"]');
  expect(card.querySelector('[data-testid="qr"]')).not.toBeNull();
  expect(card.textContent).toContain("لاعب أول");
});

test("a new card when one was printed asks first, since it cancels the old one", async () => {
  mockConfirm = false;
  await mount({ canCoach: true, canManage: true }, { ...PLAYER, cardIssuedAt: "2026-10-01T10:00:00Z" });
  await act(async () => button().click());
  expect(mockAsked).toHaveLength(1);
  expect(issueLoginCard).not.toHaveBeenCalled();
});

test("a coach without sports.manage has no card button", async () => {
  await mount({ canCoach: true, canManage: false });
  expect(button()).toBeUndefined();
});
