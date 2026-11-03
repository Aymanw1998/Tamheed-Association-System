import { API_BASE_URL } from "../WebServer/services/api";

// The passport version of a stored photo link: the person on a white
// background, 35:45, made by the server (GET /api/photos/passport/:fileId).
// Until it is made the server answers with the photo itself. Anything else
// (a picked File, an object URL, an empty link, another site's link) comes
// back unchanged.
const DRIVE_LINK = /^https:\/\/(?:lh3\.googleusercontent\.com\/d\/|drive\.google\.com\/(?:file\/d\/|uc\?(?:[^#]*&)?id=))([\w-]{10,200})(?:[/?&#]|$)/;

export const passportSrc = (link) => {
  if (typeof link !== "string") return link;
  const m = link.match(DRIVE_LINK);
  return m ? `${API_BASE_URL}/photos/passport/${m[1]}` : link;
};

// The size the previews show a photo at (35:45).
export const PASSPORT_PREVIEW = { width: "105px", height: "135px", objectFit: "cover", borderRadius: "8px", marginTop: "8px" };

// The photo for a PDF, as a data: URL of its passport version so html2canvas
// can draw it; the link itself (the old way) when that cannot be fetched.
export const pdfPhoto = async (link) => {
  const src = passportSrc(link);
  if (!src || src === link) return link;
  try {
    const res = await fetch(src);
    if (!res.ok) return link;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return link;
  }
};
