import { activateOnKey, asButton } from "./keyActivate";

test("Enter and Space click the element; other keys and inner targets do not", () => {
  const el = document.createElement("div");
  const click = jest.fn();
  el.addEventListener("click", click);
  const inner = document.createElement("span");
  el.appendChild(inner);
  const ev = (key, target = el) => ({ key, target, currentTarget: el, preventDefault: jest.fn() });
  activateOnKey(ev("Enter"));
  activateOnKey(ev(" "));
  activateOnKey(ev("a"));
  activateOnKey(ev("Enter", inner));
  expect(click).toHaveBeenCalledTimes(2);
});

test("asButton gives role, tab stop and an optional label", () => {
  expect(asButton("درس")).toMatchObject({ role: "button", tabIndex: 0, "aria-label": "درس" });
  expect(asButton()).not.toHaveProperty("aria-label");
});
