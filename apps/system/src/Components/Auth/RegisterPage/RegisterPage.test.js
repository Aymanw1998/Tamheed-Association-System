import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }));
jest.mock("../../../WebServer/services/auth/fuctionsAuth", () => ({ register: jest.fn() }));
jest.mock("../../../WebServer/services/user/functionsUser", () => ({ uploadPhoto: jest.fn() }));
jest.mock("../../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../../../utils/photoPick", () => ({ usePhotoPick: () => ({ busy: false, pick: jest.fn() }), PHOTO_NOT_READY: "" }));

import { register } from "../../../WebServer/services/auth/fuctionsAuth";
import RegisterPage from "./RegisterPage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REQUIRED = ["tz", "password", "firstname", "lastname", "birth_date", "gender", "phone", "city", "street"];

let host, root;
beforeEach(async () => {
  register.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<RegisterPage />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const send = async () => {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent.includes("إرسال طلب التسجيل"));
  await act(async () => button.click());
};

test("every field that blocks the request carries the red star", () => {
  for (const name of REQUIRED) {
    const label = host.querySelector(`label[for="reg-${name}"]`);
    expect(label.textContent).toContain("*");
    expect(label.querySelector('span[aria-hidden="true"]').style.color).toBe("red");
  }
});

test("email carries no star and blocks nothing", () => {
  expect(host.querySelector('label[for="reg-email"]').textContent).not.toContain("*");
});

test("the city starts as الرملة and can be changed", () => {
  const city = host.querySelector("#reg-city");
  expect(city.value).toBe("الرملة");
  expect(city.readOnly).toBe(false);
});

const type = async (id, value) => {
  const input = host.querySelector(id);
  const proto = input.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(input, value);
    input.dispatchEvent(new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
};

test("with everything else valid, an empty password alone stops the request", async () => {
  await type("#reg-tz", "000000018");
  await type("#reg-firstname", "a");
  await type("#reg-lastname", "b");
  await type("#reg-birth_date", "2000-01-01");
  await type("#reg-gender", "ذكر");
  await type("#reg-phone", "0521234567");
  await type("#reg-street", "c");
  await send();
  expect(register).not.toHaveBeenCalled();
  const message = host.querySelector("#reg-password").closest("div").nextElementSibling;
  expect(message.textContent).toBe("هذا الحقل مطلوب");

  await type("#reg-password", "pw");
  await send();
  expect(register).toHaveBeenCalledTimes(1);
  expect(register.mock.calls[0][0]).toMatchObject({ password: "pw", city: "الرملة" });
});
