import { installPlatform, canPromptInstall, promptInstall, subscribeInstall, openInstallGuide, onInstallGuide } from "./installState";

// "Install the app" for people who do not know how (owner, 2026-11-01).
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const env = (userAgent, standalone = false) => ({
  navigator: { userAgent, platform: "", maxTouchPoints: 0, standalone },
  matchMedia: () => ({ matches: standalone }),
});

test("each phone gets its own way to install; a computer and an installed app get none", () => {
  expect(installPlatform(env(IPHONE_SAFARI))).toBe("ios-safari");
  expect(installPlatform(env(IPHONE_CHROME))).toBe("ios-other");
  expect(installPlatform(env(ANDROID))).toBe("android");
  expect(installPlatform(env(WINDOWS))).toBe("desktop");
  expect(installPlatform(env(ANDROID, true))).toBe("installed");
});

test("the browser's install prompt is kept and used once", async () => {
  const seen = [];
  const stop = subscribeInstall(() => seen.push(canPromptInstall()));
  const evt = new Event("beforeinstallprompt", { cancelable: true });
  evt.prompt = jest.fn(() => Promise.resolve());
  evt.userChoice = Promise.resolve({ outcome: "accepted" });
  window.dispatchEvent(evt);
  expect(evt.defaultPrevented).toBe(true);
  expect(canPromptInstall()).toBe(true);
  expect(await promptInstall()).toBe("accepted");
  expect(evt.prompt).toHaveBeenCalled();
  expect(canPromptInstall()).toBe(false);
  expect(await promptInstall()).toBe("unavailable");
  expect(seen).toEqual([true, false]);
  stop();
});

test("any button can open the install guide", () => {
  const opened = [];
  const stop = onInstallGuide(() => opened.push(1));
  openInstallGuide();
  expect(opened).toEqual([1]);
  stop();
  openInstallGuide();
  expect(opened).toEqual([1]);
});
