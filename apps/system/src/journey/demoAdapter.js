import axios from "axios";
import { demoEpoch, getDemoStore, isDemo } from "./demoMode";
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
//
// The mode is fixed when a request is first sent: a request started on real
// data stays real when it is retried after a token refresh, even if training
// started meanwhile; one started in training never reaches the server (except
// allowed URLs), even if training ended or restarted before its retry.

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

const demoAdapterFor = (realAdapter) => {
  const adapter = (config) => {
    const method = String(config.method || "get").toLowerCase();
    const real = () => (typeof realAdapter === "function" ? realAdapter : axios.getAdapter(realAdapter, config))(config);
    // Started on real data (a retry after a token refresh, sent once training
    // started): it stays real. Allowed URLs are always real.
    if (config.__realAtStart === true || isAllowedDuringDemo(method, config.url)) return real();

    // Started in training mode: it never reaches the server, even when that
    // training session ended (or a new one started) before it was sent.
    const store = getDemoStore();
    if (!isDemo() || !store || config.__demoEpoch !== demoEpoch()) {
      return settle(config, 409, { ok: false, code: "DEMO_BLOCKED", message: DEMO_BLOCKED_MESSAGE });
    }

    const answer = handleDemoRequest({ method, url: config.url, params: config.params, data: config.data }, store);
    if (answer) return settle(config, answer.status, answer.data);

    if (READ_METHODS.has(method)) return settle(config, 200, { ok: true, result: [] });

    if (process.env.NODE_ENV === "development") {
      console.warn(`[training] blocked ${method.toUpperCase()} ${config.url}: not sent to the server`);
    }
    return settle(config, 409, { ok: false, code: "DEMO_BLOCKED", message: DEMO_BLOCKED_MESSAGE });
  };
  adapter.__demoWrapped = true;
  return adapter;
};

export function installDemoAdapter(instance) {
  instance.interceptors.request.use((config) => {
    // The mode is decided on the first send; a retry (api.request(config)
    // after a token refresh) keeps it, whatever the mode is by then.
    if (typeof config.__realAtStart !== "boolean") {
      config.__realAtStart = !isDemo();
      config.__demoEpoch = isDemo() ? demoEpoch() : null;
    }
    if (!config.__realAtStart && !(config.adapter && config.adapter.__demoWrapped)) {
      config.adapter = demoAdapterFor(config.adapter);
    }
    return config;
  });
  return instance;
}
