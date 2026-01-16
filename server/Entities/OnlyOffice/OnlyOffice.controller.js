const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const { User } = require("../User/User.model");
const { Document, Packer, Paragraph, AlignmentType } = require("docx");

const baseUrl = "http://host.docker.internal:2025";
const docsDir = path.join(process.cwd(), "storage", "docs");

async function ensureDocExists(id) {
  const filePath = path.join(docsDir, `${id}.docx`);

  if (!fs.existsSync(docsDir)) 
    fs.mkdirSync(docsDir, { recursive: true });


    if (!fs.existsSync(filePath)) {
      const doc = new Document({
        sections: [
          {
            properties: {
              bidi: true, // 🔥 RTL למסמך
            },
            children: [
              new Paragraph({
                text: "",
                bidirectional: true, // 🔥 RTL לפסקה
                alignment: AlignmentType.RIGHT,
              }),
            ],
          },
        ],
      });
      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buffer);
    }
      return filePath;
}

const getOnlyOfficeConfig = async (req, res) => {
  const { id } = req.params;
  console.log(id, req.user);

  const user = await User.findById(req.user.id);
  const secret = process.env.ONLYOFFICE_JWT_SECRET;
  const SERVER_URL = baseUrl;

  const filePath = await ensureDocExists(id);
  const stat = fs.statSync(filePath);

  const key = crypto
    .createHash("md5")
    .update(`${id}:${stat.mtimeMs}`)
    .digest("hex");

  const config = {
    documentType: "word",
    document: {
      title: `${id}.docx`,
      url: `${SERVER_URL}/api/doc/${id}/file`,
      fileType: "docx",
      key,
    },
    editorConfig: {
      mode: "edit",
      lang: "ar",
      callbackUrl: `${SERVER_URL}/api/onlyoffice/${id}/callback`,
      user: { id: user ? user.tz : "1", name: user? (user.firstname + " " + user.lastname) : "Guest" },
      customization: { forcesave: true },
    },
  };

  config.token = jwt.sign(config, secret);

  return res.json(config);
};

const postOnlyOfficeCallback = async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  if (data.status !== 2 && data.status !== 6) {
    return res.json({ error: 0 });
  }

  try {
    const targetPath = path.join(docsDir, `${id}.docx`);

    const response = await axios.get(data.url, { responseType: "stream" });

    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(targetPath);
      response.data.pipe(writer);
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    return res.json({ error: 0 });
  } catch (err) {
    console.error("OnlyOffice callback error:", err?.message || err);
    return res.json({ error: 1 });
  }
};

module.exports = {
  getOnlyOfficeConfig,
  postOnlyOfficeCallback,
};
