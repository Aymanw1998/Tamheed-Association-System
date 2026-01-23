const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        attendance: [{type: mongoose.Schema.Types.ObjectId, ref: "Users"}],
        title: [{ type: String, trim: true, default: "" }],
        stitle: {type: String, trim: true, defualt: ""},
        info: { type: String, required: true }, // saved rich text as HTML
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    },
    { timestamps: true }
);

const Report = mongoose.model("Reports", reportSchema);
module.exports = Report;