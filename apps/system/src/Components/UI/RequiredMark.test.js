// Which pages must show the star, and how many. A new required field on one of
// these pages means updating this list on purpose.
const fs = require("fs");
const path = require("path");

const COUNTS = {
  "Auth/RegisterPage/RegisterPage.jsx": 9,
  "Auth/ForgotPassword/ForgotPassword.jsx": 4,
  "Auth/LoginPage/LoginPage.jsx": 3,
  "Auth/ForcedPasswordChange/ForcedPasswordChange.jsx": 2,
  "Profile/ChangeOwnPassword.jsx": 2,
  "Profile/Profile.jsx": 8,
  "Global/ReportProblem/ReportProblem.jsx": 1,
  "Files/FilesPage.jsx": 1,
  "Vehicle/VehicleDocuments.jsx": 1,
  "Notice/NoticesBoard.jsx": 1,
  "Sport/NoticesTab.jsx": 1,
  "Sport/LessonsTab.jsx": 2,
};

test.each(Object.entries(COUNTS))("%s marks its required fields", (file, count) => {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  expect(source.match(/<RequiredMark \/>/g)).toHaveLength(count);
});

test("the star stays one item with its text in labels laid out as grid or column", () => {
  for (const file of ["Notice/NoticesBoard.jsx", "Sport/NoticesTab.jsx", "Sport/LessonsTab.jsx"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    expect(source.match(/<span>[^<]*<RequiredMark \/><\/span>/g)).toHaveLength(source.match(/<RequiredMark \/>/g).length);
  }
});

test("the vehicle test date is required only for a test that passed or failed", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "Vehicle", "VehicleRecords.jsx"), "utf8");
  expect(source).toContain('required: (draft) => draft.result === "passed" || draft.result === "failed"');
  expect(source).toContain('typeof field.required === "function" ? field.required(draft)');
});

test("the user form stars exactly what blocks saving", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "User", "EditUser.jsx"), "utf8");
  const starred = [...source.matchAll(/<label>([^<]+)<span style=\{\{color: "red"\}\}>\*<\/span>/g)].map((m) => m[1]);
  expect(starred).toEqual(["رقم الهوية:", "الاسم الشخصي:", "اسم العائلة:", "الهاتف:"]);
  // A new user also needs a first password and a role.
  expect(source).toContain("<label>كلمة المرور:{isNew && <RequiredMark />}</label>");
  expect(source).toContain('<label>{t("perms.role")}:<RequiredMark /></label>');
});
