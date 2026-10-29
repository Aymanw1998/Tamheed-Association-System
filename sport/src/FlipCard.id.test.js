import React, { act } from "react";
import { createRoot } from "react-dom/client";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./api.js", () => ({ getIdNumber: jest.fn(), photoUrl: () => "/p" }));

const { getIdNumber } = require("./api.js");
const FlipCard = require("./FlipCard.jsx").default;

const card = { sport: { icon: "⚽" }, jerseyNumber: 7, position: "", statDefs: [], values: {}, attendance: { rate: null, late: 0 } };
const me = (firstname) => ({ student: { firstname, lastname: "", hasPhoto: false, photoVersion: null }, card, lessons: [] });

test("the ID number is asked again when the card changes, and the old one never stays", async () => {
  const answers = [{ ok: true, data: { ok: true, tz: "111111118" } }, { ok: true, data: { ok: true, tz: "222222226" } }];
  getIdNumber.mockImplementation(() => Promise.resolve(answers.shift()));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => root.render(<FlipCard me={me("A")} />));
  expect(host.textContent).toContain("111111118");

  await act(async () => root.render(<FlipCard me={me("B")} />));
  expect(host.textContent).not.toContain("111111118");
  expect(host.textContent).toContain("222222226");
  expect(getIdNumber).toHaveBeenCalledTimes(2);

  await act(async () => root.unmount());
  host.remove();
});
