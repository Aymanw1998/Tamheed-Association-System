import { printCard, sendCard } from "./cardShare";

const file = { name: "card.png", type: "image/png" };
const card = { file, url: "https://sport.example/#card=abc", name: "ليلى" };

function env(overrides = {}) {
  return {
    share: jest.fn(async () => {}),
    canShare: jest.fn(() => true),
    print: jest.fn(),
    copy: jest.fn(async () => {}),
    download: jest.fn(),
    standalone: false,
    ...overrides,
  };
}

test("in a browser, printing uses the browser's printing", async () => {
  const e = env();
  expect(await printCard(card, e)).toBe("printed");
  expect(e.print).toHaveBeenCalledTimes(1);
  expect(e.share).not.toHaveBeenCalled();
});

test("in the installed app, where printing does nothing, it opens the share sheet with the picture", async () => {
  const e = env({ standalone: true });
  expect(await printCard(card, e)).toBe("shared");
  expect(e.print).not.toHaveBeenCalled();
  expect(e.share.mock.calls[0][0].files).toEqual([file]);
});

test("in the installed app without file sharing, the picture is saved instead", async () => {
  const e = env({ standalone: true, canShare: jest.fn(() => false) });
  expect(await printCard(card, e)).toBe("downloaded");
  expect(e.download).toHaveBeenCalledWith(file);
  expect(e.print).not.toHaveBeenCalled();
});

test("sending shares the picture and the link together", async () => {
  const e = env();
  expect(await sendCard(card, e)).toBe("shared");
  const data = e.share.mock.calls[0][0];
  expect(data.files).toEqual([file]);
  expect(data.text).toContain(card.url);
});

test("without file sharing, sending shares the link alone", async () => {
  const e = env({ canShare: jest.fn(() => false) });
  expect(await sendCard(card, e)).toBe("shared");
  expect(e.share.mock.calls[0][0]).toEqual({ title: expect.any(String), text: expect.stringContaining(card.url) });
});

test("with no sharing at all, the link is copied and the picture saved", async () => {
  const e = env({ share: undefined, canShare: undefined });
  expect(await sendCard(card, e)).toBe("copied");
  expect(e.copy).toHaveBeenCalledWith(card.url);
  expect(e.download).toHaveBeenCalledWith(file);
});

test("closing the share sheet is not a failure", async () => {
  const aborted = Object.assign(new Error("x"), { name: "AbortError" });
  const e = env({ share: jest.fn(async () => { throw aborted; }) });
  expect(await sendCard(card, e)).toBe("cancelled");
  expect(e.download).not.toHaveBeenCalled();
});

test("a share that fails falls back to copying and saving", async () => {
  const e = env({ share: jest.fn(async () => { throw new Error("no"); }) });
  expect(await sendCard(card, e)).toBe("copied");
  expect(e.copy).toHaveBeenCalled();
  expect(e.download).toHaveBeenCalled();
});

test("no picture yet: sending still gives the link", async () => {
  const e = env();
  expect(await sendCard({ ...card, file: null }, e)).toBe("shared");
  expect(e.share.mock.calls[0][0].files).toBeUndefined();
});
