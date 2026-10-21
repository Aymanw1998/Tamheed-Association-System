// Proposes posting a notice on the notice board (notices.post). Nothing is
// posted until the user approves the card.
module.exports = {
  name: "propose_notice",
  description: "Propose posting a notice on the notice board for all staff. This does NOT post it: the user must approve "
    + "the card. severity: critical, important or info. Returns pendingActionId and a summary.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", minLength: 1, maxLength: 120, description: "Notice title." },
      body: { type: "string", maxLength: 2000, description: "Notice text (may be empty)." },
      severity: { type: "string", enum: ["critical", "important", "info"], description: "How important it is." },
    },
    required: ["title", "body", "severity"],
    additionalProperties: false,
  },
  run: (input, ctx) => ctx.propose("notice", input),
};
