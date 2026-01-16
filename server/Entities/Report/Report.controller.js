const mongoose = require("mongoose");
const puppeteer = require("puppeteer");
const Report = require("./Report.model.js");

const { logWithSource } = require("../../middleware/logger.js");

const exportPdf = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid id" });
        }

        const report = await Report.findById(id);
        if (!report) return res.status(404).json({ message: "Not found" });

        const browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });

        const page = await browser.newPage();

        const htmlDoc = `
        <!doctype html>
        <html>
            <head>
            <meta charset="utf-8"/>
            <style>
                body { font-family: Arial, sans-serif; padding: 24px; }
                img { max-width: 100%; height: auto; }
            </style>
            </head>
            <body>
            <h2>${escapeHtml(report.title || "Untitled")}</h2>
            <div>${report.html}</div>
            </body>
        </html>
        `;

        await page.setContent(htmlDoc, { waitUntil: "networkidle0" });

        const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "12mm", bottom: "15mm", left: "12mm" },
        });

        await browser.close();

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="report-${id}.pdf"`);
        return res.status(200).send(pdfBuffer);
    } catch (error) {
        logWithSource("Report.controller.exportPdf", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// يساعد فقط للعنوان (لا يلمس report.html)
function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/**
 * GET /api/reports
 * Get all reports
 */
const getAll = async (req, res) => {
    try {
        const { type } = req.query;

        const filter = {};
        if (type) filter.type = type;

        const reports = await Report.find(filter).sort({ createdAt: -1 });
        return res.status(200).json(reports);
    } catch (error) {
        logWithSource("Report.controller.getAll", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * GET /api/reports/:id
 * Get report by id
 */
const getById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid id" });
        }

        const report = await Report.findById(id);
        if (!report) return res.status(404).json({ message: "Not found" });

        return res.status(200).json(report);
    } catch (error) {
        logWithSource("Report.controller.getById", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * POST /api/reports
 * Create report
 */
const post = async (req, res) => {
    try {
        const { date,attendance, title, info, createdBy} = req.body;

        if (!info && info.trim() === "") {
            return res.status(400).json({ message: "يجب ان يكون صلب موضوع" });
        }
        const report = await Report.create({
        date : date || new Date(),
        attendance : attendance || [],
        title: title || [],
        info,
        createdBy: createdBy || req.user?._id, // optional
        });

        return res.status(201).json(report);
    } catch (error) {
        logWithSource("Report.controller.post", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * PUT /api/reports/:id
 * Update report
 */
const put = async (req, res) => {
    try {
        const { id } = req.params;
        const { date,attendance, title, info} = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid id" });
        }

        const update = {};
        if (date !== undefined) update.date = date;
        if (attendance !== undefined) update.attendance = attendance;
        if (title !== undefined) update.title = title;
        if (info !== undefined) update.info = info;

        const report = await Report.findByIdAndUpdate(id, update, {
        new: true,
        runValidators: true,
        });

        if (!report) return res.status(404).json({ message: "Not found" });

        return res.status(200).json(report);
    } catch (error) {
        logWithSource("Report.controller.put", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * DELETE /api/reports/:id
 * Delete report
 */
 const remove = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid id" });
        }

        const report = await Report.findByIdAndDelete(id);
        if (!report) return res.status(404).json({ message: "Not found" });

        return res.status(200).json({ message: "Deleted successfully" });
    } catch (error) {
        logWithSource("Report.controller.remove", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

module.exports = {
    getAll,
    getById,
    post,
    put,
    remove,
    exportPdf,
};