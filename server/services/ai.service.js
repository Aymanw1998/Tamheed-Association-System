const axios = require("axios");

const getGlobalServerUrl = () =>
  (process.env.GLOBAL_SERVER_URL || "http://localhost:5000").replace(/\/+$/, "");

const askTamheedAI = async ({ message, context = {} }) => {
  const globalServerUrl = getGlobalServerUrl();

  console.log("[Tamheed Server] Forwarding AI request to global-server", {
    url: `${globalServerUrl}/api/ai/chat`,
    project: "tamheed",
    source: "tamheed-server",
    message,
    context,
  });

  const { data } = await axios.post(
    `${globalServerUrl}/api/ai/chat`,
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

  console.log("[Tamheed Server] Response received from global-server", {
    data,
  });

  return data;
};

module.exports = {
  askTamheedAI,
};
