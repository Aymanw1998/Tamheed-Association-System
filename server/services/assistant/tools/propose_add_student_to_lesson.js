const { OBJECT_ID } = require("./_shared");

// Proposes adding a student to a lesson by full ID number (lessons.roster +
// the lesson screen's list_tz rule). Nothing changes until the user approves.
module.exports = {
  name: "propose_add_student_to_lesson",
  description: "Propose adding one student to a lesson, named by the student's full ID number exactly as the user gave it. "
    + "This does NOT add anyone: the user must approve the card. Students waiting for approval, unknown numbers and "
    + "students already on the lesson are refused (NOT_ADDABLE). Returns pendingActionId and a summary.",
  input_schema: {
    type: "object",
    properties: {
      lessonId: { type: "string", pattern: OBJECT_ID, description: "The lesson id." },
      tz: { type: "string", pattern: "^[0-9]{5,9}$", description: "The student's full ID number, digits only." },
    },
    required: ["lessonId", "tz"],
    additionalProperties: false,
  },
  run: (input, ctx) => ctx.propose("add_student_to_lesson", input),
};
