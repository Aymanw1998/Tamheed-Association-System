// Proposes a daily report (reports.create). Nothing is created until the
// user approves the card.
module.exports = {
  name: "propose_report",
  description: "Propose creating a daily report written by the user. This does NOT create it: the user must approve the "
    + "card. date is the report date; title is a short subject; text is the report body, written from what the user "
    + "said (do not invent facts). Returns pendingActionId and a summary.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", format: "date", description: "Report date, YYYY-MM-DD." },
      title: { type: "string", minLength: 1, maxLength: 120, description: "Short subject." },
      text: { type: "string", minLength: 1, maxLength: 5000, description: "The report text." },
    },
    required: ["date", "title", "text"],
    additionalProperties: false,
  },
  run: (input, ctx) => ctx.propose("report", input),
};
