import React from "react";
import { cleanup, queryByText, render } from "../Display/displayTestDom";
import LessonsHub from "./LessonsHub";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../UI/TabIndicator", () => () => null);

// The display screens tab (owner, 2026-11-12) shows only with displays.manage.
const ALL_LESSONS = ["lessons.view", "calendar.view", "attendance.view"];
const mount = (permissions) => {
  localStorage.setItem("permissions", JSON.stringify(permissions));
  render(<LessonsHub active="lessons"><p>body</p></LessonsHub>);
};
afterEach(() => { cleanup(); localStorage.clear(); });

test("no displays tab without displays.manage", () => {
  mount(ALL_LESSONS);
  expect(queryByText("برنامج الأسبوع")).toBeTruthy();
  expect(queryByText("شاشات العرض")).toBeNull();
});

test("the displays tab shows with displays.manage", () => {
  mount([...ALL_LESSONS, "displays.manage"]);
  expect(queryByText("شاشات العرض")).toBeTruthy();
});
