import { itUrl, itUrlWithPass, takePassFromAddress, isItLink, itHostFor } from "./siteLink";

afterEach(() => {
  delete process.env.REACT_APP_IT_URL;
  window.history.replaceState(null, "", "/");
});

test("the IT site address is REACT_APP_IT_URL when set, else this site's address with «it.» in front", () => {
  process.env.REACT_APP_IT_URL = "https://it.example.test/";
  expect(itUrl()).toBe("https://it.example.test");
  delete process.env.REACT_APP_IT_URL;
  expect(itUrl()).toBe(`${window.location.protocol}//${itHostFor(window.location.host)}`);
});

test("the pass goes in the fragment, never in the query string", () => {
  process.env.REACT_APP_IT_URL = "https://it.example.test";
  const url = itUrlWithPass("a_B-1");
  expect(url).toBe("https://it.example.test/#pass=a_B-1");
  expect(url).not.toContain("?");
  expect(itUrlWithPass("a b/c")).toContain("#pass=a%20b%2Fc");
});

test("the pass is read from the address and removed from it at once, the rest stays", () => {
  window.history.replaceState(null, "", "/x?q=1#pass=abc_DEF-123&keep=1");
  expect(takePassFromAddress()).toBe("abc_DEF-123");
  expect(window.location.hash).toBe("#keep=1");
  expect(window.location.search).toBe("?q=1");
  window.history.replaceState(null, "", "/#pass=zzz");
  expect(takePassFromAddress()).toBe("zzz");
  expect(window.location.href).not.toContain("zzz");
});

test("no pass in the address gives an empty string and leaves the address alone", () => {
  window.history.replaceState(null, "", "/x#other=1");
  expect(takePassFromAddress()).toBe("");
  expect(window.location.hash).toBe("#other=1");
});

test("only a link into the IT site's own address is an IT link", () => {
  process.env.REACT_APP_IT_URL = "https://it.example.test";
  expect(isItLink("https://it.example.test/users/900000002")).toBe(true);
  expect(isItLink("https://evil.test/users/900000002")).toBe(false);
  expect(isItLink("https://it.example.test.evil.test/users/1")).toBe(false);
  expect(isItLink("http://it.example.test/users/1")).toBe(false);
  expect(isItLink("/users/1")).toBe(false);
  expect(isItLink(null)).toBe(false);
});

test("the IT host replaces system. or www. (owner, 2026-11-03), never stacks it.system.", () => {
  expect(itHostFor("system.tamheed-ramla.org")).toBe("it.tamheed-ramla.org");
  expect(itHostFor("www.tamheed-ramla.org")).toBe("it.tamheed-ramla.org");
  expect(itHostFor("tamheed-ramla.org")).toBe("it.tamheed-ramla.org");
  expect(itHostFor("SYSTEM.Tamheed-Ramla.org")).toBe("it.Tamheed-Ramla.org");
  expect(itHostFor("localhost:3000")).toBe("it.localhost:3000");
});
