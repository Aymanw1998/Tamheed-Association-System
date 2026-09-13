const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT =
  "You are Tamheed AI, an assistant embedded in the Tamheed Association's " +
  "school management system. Answer clearly and concisely in the language " +
  "the user writes in (Arabic, Hebrew, or English). You do not have access " +
  "to the system's data (students, lessons, reports) - only answer from " +
  "general knowledge and say so if a question requires live data you can't see.";

let client = null;
const getClient = () => {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic();
  return client;
};

const askTamheedAI = async ({ message, context = {} }) => {
  const anthropic = getClient();
  if (!anthropic) {
    return {
      success: false,
      message: "AI is not configured on this server (missing ANTHROPIC_API_KEY).",
    };
  }

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: { effort: "low" },
      messages: [
        {
          role: "user",
          content: context && Object.keys(context).length
            ? `${message}\n\n(context: ${JSON.stringify(context)})`
            : message,
        },
      ],
    });

    const answer = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return { success: true, answer };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[Tamheed AI] Invalid ANTHROPIC_API_KEY");
      return { success: false, message: "AI authentication failed - check the server's API key." };
    }
    if (error instanceof Anthropic.RateLimitError) {
      return { success: false, message: "AI is rate limited right now - try again shortly." };
    }
    if (error instanceof Anthropic.APIError) {
      console.error("[Tamheed AI] API error:", error.status, error.message);
      return { success: false, message: "AI service returned an error." };
    }
    console.error("[Tamheed AI] Unexpected error:", error);
    return { success: false, message: "AI service is not available." };
  }
};

module.exports = {
  askTamheedAI,
};
