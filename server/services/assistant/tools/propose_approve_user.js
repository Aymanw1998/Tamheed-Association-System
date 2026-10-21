// Proposes approving a new user who is waiting, with a first role, under the
// approval rule of the users screen (users.approve; a role below the
// approver's own). Nothing changes until the user approves the card. It
// cannot change an existing user's role.
module.exports = {
  name: "propose_approve_user",
  description: "Propose approving one new user who is waiting for approval (see pending_items), giving the first role. "
    + "This does NOT approve anyone: the user must approve the card. tz is the waiting user's full ID number; role is "
    + "ادارة (management), مرشد (guide) or مساعد (assistant), and must be below the user's own role. It cannot change "
    + "the role of an existing user. Returns pendingActionId and a summary.",
  input_schema: {
    type: "object",
    properties: {
      tz: { type: "string", pattern: "^[0-9]{5,9}$", description: "The waiting user's full ID number." },
      role: { type: "string", enum: ["ادارة", "مرشد", "مساعد"], description: "The first role." },
    },
    required: ["tz", "role"],
    additionalProperties: false,
  },
  run: (input, ctx) => ctx.propose("approve_user", input),
};
