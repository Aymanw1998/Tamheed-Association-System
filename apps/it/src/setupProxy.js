// Development only: forwards /api to the local server and tells it the request
// came for the IT site's host (the server serves the IT API only for IT_HOST).
// Run the server with IT_HOST=it.localhost and open http://it.localhost:3002.
// Another name: IT_DEV_HOST=<name> before `npm start`, the same value as IT_HOST.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.IT_DEV_SERVER || "http://localhost:5000",
      changeOrigin: false,
      headers: { "X-Forwarded-Host": process.env.IT_DEV_HOST || "it.localhost" },
    })
  );
};
