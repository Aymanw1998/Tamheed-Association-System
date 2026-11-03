import { systemHostFor, systemUrl, systemUrlWithPass } from "./siteLink";

afterEach(() => { delete process.env.REACT_APP_SYSTEM_URL; });

test("the everyday app's host is system.<domain> (owner, 2026-11-03)", () => {
  expect(systemHostFor("it.tamheed-ramla.org")).toBe("system.tamheed-ramla.org");
  expect(systemHostFor("IT.Tamheed-Ramla.org")).toBe("system.Tamheed-Ramla.org");
  expect(systemHostFor("tamheed-ramla.org")).toBe("system.tamheed-ramla.org");
});

test("REACT_APP_SYSTEM_URL wins; the pass goes in the fragment", () => {
  process.env.REACT_APP_SYSTEM_URL = "https://system.example.test/";
  expect(systemUrl()).toBe("https://system.example.test");
  expect(systemUrlWithPass("a b")).toBe("https://system.example.test/#pass=a%20b");
  delete process.env.REACT_APP_SYSTEM_URL;
  expect(systemUrl()).toBe(`${window.location.protocol}//${systemHostFor(window.location.host)}`);
});
