// One switch for every AI feature (the chat assistant and vehicle document
// reading). Off unless AI_ENABLED=true and an Anthropic key is set, so the
// owner can hide AI from the whole system without touching anything else.
// Real-time alerts are not AI and stay on either way.
function aiEnabled() {
  const flag = String(process.env.AI_ENABLED || "").trim().toLowerCase();
  return flag === "true" && Boolean(String(process.env.ANTHROPIC_API_KEY || "").trim());
}

module.exports = { aiEnabled };
