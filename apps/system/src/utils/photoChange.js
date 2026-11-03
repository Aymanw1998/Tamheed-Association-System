// What saving a form must do to its stored photo. `originalPhoto` is the link
// loaded from the server; `currentPhoto` is the form state: the same link
// (untouched), a picked File (replace), or null (removed by the user).
// Nothing touches the stored photo or its Drive file unless it changed.
export const photoAction = (originalPhoto, currentPhoto) => {
  if (currentPhoto instanceof File) return "upload";
  if (originalPhoto && !currentPhoto) return "remove";
  return "keep";
};
