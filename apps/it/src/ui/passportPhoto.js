// The passport version of a stored photo link (the person on a white
// background, 35:45), made by the server: GET /api/photos/passport/:fileId,
// public. Until it is made the server answers with the photo itself. Anything
// else (an empty link, another site's link) comes back unchanged.
const DRIVE_LINK = /^https:\/\/(?:lh3\.googleusercontent\.com\/d\/|drive\.google\.com\/(?:file\/d\/|uc\?(?:[^#]*&)?id=))([\w-]{10,200})(?:[/?&#]|$)/;

export const passportSrc = (link) => {
  if (typeof link !== "string") return link;
  const m = link.match(DRIVE_LINK);
  return m ? `/api/photos/passport/${m[1]}` : link;
};
