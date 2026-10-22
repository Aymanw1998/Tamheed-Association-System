import axios from "axios";
import { getDemoStore, isDemo } from "./demoMode";
import { DEMO_BLOCKED_MESSAGE, handleDemoRequest, isAllowedDuringDemo } from "./demoRoutes";

// Training mode's single interception point for an axios instance.
//
// Off demo nothing changes. While demo is on, each request's adapter is
// swapped at request time (so whatever adapter the instance has then is the
// "real" one):
//   - allowed URLs (journey progress, session) go to the real adapter;
//   - a request the demo store knows is answered from it;
//   - an unknown GET answers { ok: true, result: [] };
//   - an unknown write is rejected with 409 DEMO_BLOCKED and never sent.

const READ_METHODS = new Set(["get", "head", "options"]);

const toResponse = (config, status, data) => ({
  data,
  status,
  statusText: status < 400 ? "OK" : "Demo",
  headers: {},
  config,
  request: {},
});

const settle = (config, status, data) => {
  const response = toResponse(config, status, data);
  const valid = typeof config.validateStatus === "function" ? config.validateStatus(status) : status >= 200 && status < 300;
  if (valid) return Promise.resolve(response);
  const code = status >= 500 ? axios.AxiosError.ERR_BAD_RESPONSE : axios.AxiosError.ERR_BAD_REQUEST;
  return Promise.reject(new axios.AxiosError(`Request failed with status code ${status}`, code, config, response.request, response));
};

const demoAdapterFor = (realAdapter) => (config) => {
  const method = String(config.method || "get").toLowerCase();
  // A retried request (after a token refresh) keeps this adapter: if training
  // ended meanwhile, it goes out as usual.
  if (!isDemo() || isAllowedDuringDemo(method, config.url)) {
    const real = typeof realAdapter === "function" ? realAdapter : axios.getAdapter(realAdapter, config);
    return real(config);
  }

  const answer = handleDemoRequest({ method, url: config.url, params: config.params, data: config.data }, getDemoStore());
  if (answer) return settle(config, answer.status, answer.data);

  if (READ_METHODS.has(method)) return settle(config, 200, { ok: true, result: [] });

  if (process.env.NODE_ENV === "development") {
    console.warn(`[training] blocked ${method.toUpperCase()} ${config.url}: not sent to the server`);
  }
  return settle(config, 409, { ok: false, code: "DEMO_BLOCKED", message: DEMO_BLOCKED_MESSAGE });
};

export function installDemoAdapter(instance) {
  instance.interceptors.request.use((config) => {
    if (isDemo()) config.adapter = demoAdapterFor(config.adapter);
    return config;
  });
  return instance;
}
