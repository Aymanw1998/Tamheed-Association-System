const path = require("path");
const fs = require("fs");

const docsDir = path.join(process.cwd(), "storage", "docs");

const downloadEmptyDocx = (req, res) => {
    const filePath = path.join(docsDir, "empty.docx");
    return res.sendFile(filePath);
};

const downloadDocById = (req, res) => {
    const { id } = req.params;
    const filePath = path.join(docsDir, `${id}.docx`);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Doc not found" });
    }

    return res.sendFile(filePath);
};

module.exports = {
    downloadEmptyDocx,
    downloadDocById,
};