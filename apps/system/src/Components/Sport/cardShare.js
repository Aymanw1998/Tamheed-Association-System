// Printing and sending a player's sign-in card. window.print() does nothing in
// an app installed on an iPhone's home screen, so there the share sheet, which
// has «طباعة», takes over (owner, 2026-11-04).

function isInstalled() {
  try {
    return window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  } catch {
    return false;
  }
}

function saveFile(file) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}

const realEnv = () => ({
  share: window.navigator.share ? (data) => window.navigator.share(data) : undefined,
  canShare: window.navigator.canShare ? (data) => window.navigator.canShare(data) : undefined,
  print: () => window.print(),
  copy: (text) => window.navigator.clipboard.writeText(text),
  download: saveFile,
  standalone: isInstalled(),
});

const canShareFile = (env, file) => Boolean(file && env.share && env.canShare?.({ files: [file] }));

export async function printCard(card, env = realEnv()) {
  if (!env.standalone) {
    env.print();
    return "printed";
  }
  if (canShareFile(env, card.file)) {
    try {
      await env.share({ files: [card.file], title: card.name });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  if (card.file) env.download(card.file);
  return "downloaded";
}

export async function sendCard(card, env = realEnv()) {
  const text = `بطاقة دخول ${card.name} إلى تمهيد - رياضة: ${card.url}`;
  if (env.share) {
    const data = canShareFile(env, card.file)
      ? { files: [card.file], title: card.name, text }
      : { title: card.name, text };
    try {
      await env.share(data);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  try {
    await env.copy(card.url);
  } catch {
    if (card.file) env.download(card.file);
    return "failed";
  }
  if (card.file) env.download(card.file);
  return "copied";
}

// The whole card as a picture: title, name, QR and how to use it.
export async function cardPicture({ png, title, name, how, keep }) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = png;
  });
  const W = 1000;
  const H = 1240;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, W, H);
  c.strokeStyle = "#166534";
  c.lineWidth = 8;
  c.strokeRect(20, 20, W - 40, H - 40);
  c.textAlign = "center";
  c.direction = "rtl";
  const FONT = "Tahoma, Arial, sans-serif";
  const line = (text, y, size, color, weight = "700") => {
    c.fillStyle = color;
    c.font = `${weight} ${size}px ${FONT}`;
    c.fillText(text, W / 2, y, W - 100);
  };
  line(title, 100, 44, "#166534");
  line(name, 180, 60, "#0d3040", "800");
  c.imageSmoothingEnabled = false;
  c.drawImage(image, 150, 220, 700, 700);
  line(how, 990, 30, "#0d3040", "400");
  line(keep, 1060, 30, "#b91c1c");
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new File([blob], "login-card.png", { type: "image/png" }) : null;
}
