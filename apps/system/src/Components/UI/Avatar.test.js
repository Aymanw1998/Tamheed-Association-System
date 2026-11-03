import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import Avatar from "./Avatar";

global.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
const mount = async (props) => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Avatar {...props} />));
};
afterEach(() => { act(() => root.unmount()); container.remove(); });

test("shows the photo lazily", async () => {
  await mount({ src: "https://example.test/p.jpg", name: "سامي علي" });
  const img = container.querySelector("img");
  expect(img.getAttribute("src")).toBe("https://example.test/p.jpg");
  expect(img.getAttribute("loading")).toBe("lazy");
  expect(img.getAttribute("alt")).toBe("سامي علي");
});

test("shows the first letter without a photo", async () => {
  await mount({ src: "", name: "سامي علي" });
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("س");
});

test("falls back to the letter when the photo fails", async () => {
  await mount({ src: "https://example.test/gone.jpg", name: "سامي علي" });
  await act(async () => container.querySelector("img").dispatchEvent(new Event("error")));
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("س");
});
