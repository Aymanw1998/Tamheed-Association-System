const { askTamheedAI } = require("./ai.service.js");

const chatWithAI = async (req, res) => {
  try {
    const { message, context = {} } = req.body || {};

    if (!message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const result = await askTamheedAI({
      message: String(message).trim(),
      context,
    });

    return res.json(result);
  } catch (error) {
    console.error("TAMHEED AI ERROR FULL:", error);
    console.error("MESSAGE:", error?.message);
    console.error("RESPONSE:", error?.response?.data);

    return res.status(502).json({
      success: false,
      message: "Global server AI endpoint is not available",
    });
  }
};

module.exports = {
  chatWithAI,
};
