import { safeMarkdown } from "./safeMarkdown";

const dom = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
};

test("renders basic formatting, lists, tables and code", () => {
  const html = safeMarkdown("**bold** _it_\n\n- one\n- two\n\n1. a\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n`x` and\n\n```\ncode\n```");
  const d = dom(html);
  expect(d.querySelector("strong").textContent).toBe("bold");
  expect(d.querySelector("em").textContent).toBe("it");
  expect(d.querySelectorAll("ul li")).toHaveLength(2);
  expect(d.querySelector("ol li").textContent).toBe("a");
  expect(d.querySelector("table th").textContent).toBe("A");
  expect(d.querySelector("table td").textContent).toBe("1");
  expect(d.querySelector("pre code").textContent).toContain("code");
});

test("raw HTML from the model is shown as text, never rendered", () => {
  const html = safeMarkdown('hi <script>alert(1)</script><img src=x onerror="alert(2)"><iframe src="https://e.com"></iframe><b onclick="x()">b</b>\n\n<div>block</div>\n\n![p](https://e.com/p.png)');
  const d = dom(html);
  expect(d.querySelector("script, img, iframe, b, div")).toBeNull();
  expect(d.textContent).toContain("<script>alert(1)</script>");
  expect(d.textContent).toContain('<b onclick="x()">b</b>');
  expect(d.textContent).toContain("<div>block</div>");
});

test("a raw <a href=\"/x\"> becomes escaped text, not a link", () => {
  const html = safeMarkdown('<a href="/x" target="_blank" style="color:red">x</a>');
  const d = dom(html);
  expect(d.querySelector("a")).toBeNull();
  expect(d.textContent).toContain('<a href="/x" target="_blank" style="color:red">x</a>');
});

test("keeps in-app links and turns everything else into plain text", () => {
  const html = safeMarkdown("[student](/students/123) [ext](https://evil.com) [js](javascript:alert(1)) [proto](//evil.com) [bs](/\\evil.com)");
  const d = dom(html);
  const links = [...d.querySelectorAll("a")];
  expect(links).toHaveLength(1);
  expect(links[0].getAttribute("href")).toBe("/students/123");
  expect(links[0].textContent).toBe("student");
  expect(links[0].attributes).toHaveLength(1);
  expect(d.textContent).toContain("ext");
  expect(d.textContent).toContain("js");
});

test("links hiding a tab, newline or carriage return never survive", () => {
  const inputs = [
    "[a](/&#9;/evil.com)",
    "[a](/&#10;/evil.com)",
    "[a](/&#13;/evil.com)",
    "[a](/\t/evil.com)",
    "[a](</\t/evil.com>)",
    '<a href="/&#9;/evil.com">a</a>',
  ];
  for (const input of inputs) {
    const d = dom(safeMarkdown(input));
    expect([...d.querySelectorAll("a")].map((x) => x.getAttribute("href"))).toEqual([]);
  }
});

test("bare URLs are not auto-linked to outside sites", () => {
  const d = dom(safeMarkdown("see https://evil.com now"));
  expect(d.querySelector("a")).toBeNull();
  expect(d.textContent).toContain("https://evil.com");
});

test("empty and non-string input give an empty string", () => {
  expect(safeMarkdown("")).toBe("");
  expect(safeMarkdown(null)).toBe("");
  expect(safeMarkdown(undefined)).toBe("");
});

test("line breaks inside a paragraph are kept", () => {
  expect(dom(safeMarkdown("a\nb")).querySelector("br")).not.toBeNull();
});

test("links are kept only for the app's screens, never /api/... or unknown paths", () => {
  const d = dom(safeMarkdown("[a](/students/123) [b](/dashboard) [c](/calendar) [d](/api/ai/conversations) [e](/api) [f](/unknown/x) [g](/Students) [h](/) [i](/reports?x=1)"));
  expect([...d.querySelectorAll("a")].map((x) => x.getAttribute("href"))).toEqual(["/students/123", "/dashboard", "/calendar", "/reports?x=1"]);
  expect(d.textContent).toContain("d");
});
