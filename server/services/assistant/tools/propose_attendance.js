const { OBJECT_ID } = require("./_shared");

// Proposes saving attendance (attendance.record + student scope). Nothing is
// saved until the user approves the card (services/assistant/actionRunner.js).
module.exports = {
  name: "propose_attendance",
  description: "Propose saving attendance for one lesson on one date. This does NOT save anything: the user sees a card "
    + "with exactly what will be saved and must press approve. Only students on that lesson whom the user can see; "
    + "never a future date. Each row: studentId (from list_lessons or search_students), status, optional short notes. "
    + "Returns pendingActionId and a summary; tell the user to review and approve the card, never say it is saved.",
  input_schema: {
    type: "object",
    properties: {
      lessonId: { type: "string", pattern: OBJECT_ID, description: "The lesson id." },
      date: { type: "string", format: "date", description: "The lesson date, YYYY-MM-DD." },
      rows: {
        type: "array",
        minItems: 1,
        maxItems: 60,
        items: {
          type: "object",
          properties: {
            studentId: { type: "string", pattern: OBJECT_ID, description: "The student id." },
            status: { type: "string", enum: ["حاضر", "غائب", "متأخر"], description: "حاضر present, غائب absent, متأخر late." },
            notes: { type: "string", maxLength: 300, description: "Optional short note." },
          },
          required: ["studentId", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["lessonId", "date", "rows"],
    additionalProperties: false,
  },
  run: (input, ctx) => ctx.propose("attendance", input),
};
