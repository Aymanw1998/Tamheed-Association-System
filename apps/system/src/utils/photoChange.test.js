import { photoAction } from "./photoChange";

const STORED = "https://lh3.googleusercontent.com/d/stored-file";
const picked = () => new File(["image"], "photo.jpg", { type: "image/jpeg" });

test.each([
  ["an untouched stored photo is kept", STORED, STORED, "keep"],
  ["a removed stored photo is deleted", STORED, null, "remove"],
  ["a newly picked file replaces the stored photo", STORED, picked(), "upload"],
  ["a newly picked file is uploaded when there was no photo", null, picked(), "upload"],
  ["no photo before or after needs nothing", null, null, "keep"],
  ["an empty stored value has nothing to delete", "", null, "keep"],
])("%s", (_, originalPhoto, currentPhoto, want) => {
  expect(photoAction(originalPhoto, currentPhoto)).toBe(want);
});
