const axios = require("axios");

const getGlobalServerUrl = () =>
  (process.env.GLOBAL_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

const askTamheedAI = async ({ message, context = {} }) => {
  const { data } = await axios.post(
    `${getGlobalServerUrl()}/api/ai/chat`,
    {
      message,
      context,
      project: "tamheed",
      source: "tamheed-server",
    },
    {
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return data;
};

module.exports = {
  askTamheedAI,
};
