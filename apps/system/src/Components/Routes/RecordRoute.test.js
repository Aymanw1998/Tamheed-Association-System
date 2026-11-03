import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";
import RecordRoute from "./RecordRoute";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});

global.IS_REACT_ACT_ENVIRONMENT = true;

const Form = () => <p>form:{useParams().id}</p>;
const View = () => <p>view:{useParams().id}</p>;

const render = async (path) => {
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(
    <MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/students/:id" element={<RecordRoute view={<View />} form={<Form />} />} />
      <Route path="/students/:id/edit" element={<Form />} />
    </Routes></MemoryRouter>
  ));
  const text = container.textContent;
  await act(async () => root.unmount());
  return text;
};

test("/new opens the form, which still reads id 'new'", async () => {
  expect(await render("/students/new")).toBe("form:new");
});

test("a record id opens the view page", async () => {
  expect(await render("/students/800000001")).toBe("view:800000001");
});

test("/:id/edit opens the form with the record id", async () => {
  expect(await render("/students/800000001/edit")).toBe("form:800000001");
});
