// Development only: forwards /api to the local server and tells it the request
// came for the nasheed site's host (the server serves /api/nasheed only for
// NASHEED_HOST). Run the server with NASHEED_HOST=nasheed.localhost and open
// http://nasheed.localhost:3003. Another name: NASHEED_DEV_HOST=<name>.
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: process.env.NASHEED_DEV_SERVER || "http://localhost:5000",
      changeOrigin: false,
      headers: { "X-Forwarded-Host": process.env.NASHEED_DEV_HOST || "nasheed.localhost" },
    })
  );
};
