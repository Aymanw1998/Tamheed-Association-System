import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { InstallAppButton, InstallGuide } from "./InstallApp";
import * as state from "./installState";

// "Install the app" for people who do not know how (owner, 2026-11-01).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
const mount = async (ui) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(ui));
};
afterEach(async () => { await act(async () => root.unmount()); host.remove(); jest.restoreAllMocks(); });
const button = () => host.querySelector('[data-testid="install-app"]');

test("no button on a computer or once the app is installed", async () => {
  await mount(<><InstallAppButton platform="desktop" /><InstallAppButton platform="installed" /></>);
  expect(button()).toBeNull();
});

test("on Android with the browser's prompt, the button installs at once", async () => {
  jest.spyOn(state, "canPromptInstall").mockReturnValue(true);
  const prompt = jest.spyOn(state, "promptInstall").mockResolvedValue("accepted");
  const guide = jest.spyOn(state, "openInstallGuide");
  await mount(<InstallAppButton platform="android" />);
  await act(async () => button().click());
  expect(prompt).toHaveBeenCalled();
  expect(guide).not.toHaveBeenCalled();
});

test("on iPhone the button opens the step-by-step guide", async () => {
  await mount(<><InstallAppButton platform="ios-safari" /><InstallGuide platform="ios-safari" /></>);
  expect(host.querySelector('[data-testid="install-guide"]')).toBeNull();
  await act(async () => button().click());
  const guide = host.querySelector('[data-testid="install-guide"]');
  expect(guide.textContent).toContain("مشاركة");
  expect(guide.textContent).toContain("إضافة إلى الشاشة الرئيسية");
  expect(guide.querySelectorAll("li")).toHaveLength(3);
});

test("Android without the prompt explains the browser menu; iPhone Chrome points to the share button", async () => {
  jest.spyOn(state, "canPromptInstall").mockReturnValue(false);
  await mount(<><InstallAppButton platform="android" /><InstallGuide platform="android" /></>);
  await act(async () => button().click());
  expect(host.textContent).toContain("⋮");
  await act(async () => root.render(<InstallGuide platform="ios-other" />));
  await act(async () => state.openInstallGuide());
  expect(host.textContent).toContain("Safari");
});

test("the guide closes", async () => {
  await mount(<InstallGuide platform="ios-safari" />);
  await act(async () => state.openInstallGuide());
  await act(async () => host.querySelector('[data-testid="install-guide-close"]').click());
  expect(host.querySelector('[data-testid="install-guide"]')).toBeNull();
});
