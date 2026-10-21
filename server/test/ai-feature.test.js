const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { aiEnabled } = require("../utils/aiFeature");
const { createAiRouter } = require("../routes/ai.routes");

const withEnv = (vars, fn) => {
  const saved = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
};

test("AI is off unless AI_ENABLED is exactly true and a key is set", () => {
  withEnv({ AI_ENABLED: undefined, ANTHROPIC_API_KEY: "k" }, () => assert.equal(aiEnabled(), false));
  withEnv({ AI_ENABLED: "false", ANTHROPIC_API_KEY: "k" }, () => assert.equal(aiEnabled(), false));
  withEnv({ AI_ENABLED: "true", ANTHROPIC_API_KEY: "" }, () => assert.equal(aiEnabled(), false));
  withEnv({ AI_ENABLED: " TRUE ", ANTHROPIC_API_KEY: "k" }, () => assert.equal(aiEnabled(), true));
});

async function startApp(enabled) {
  const requireAuth = (req, res, next) => {
    if (!req.headers["x-tz"]) return res.status(401).json({ code: "NO_TOKEN" });
    req.user = { tz: req.headers["x-tz"] };
    return next();
  };
  const loadActor = (req, res, next) => {
    req.actor = { tz: req.user.tz, id: "u1", permissions: new Set(["ai.use"]) };
    return next();
  };
  const requirePermission = () => (req, res, next) => next();
  const calls = [];
  const conversations = { listOwn: async () => { calls.push("list"); return []; } };
  const app = express();
  app.use(express.json());
  app.use("/api/ai", createAiRouter({
    requireAuth, loadActor, requirePermission, conversations,
    assistant: { isConfigured: () => true, runAssistantTurn: async () => calls.push("turn") },
    rate: {}, displayMessages: () => [], isEnabled: () => enabled,
  }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, calls, base: `http://127.0.0.1:${server.address().port}/api/ai` };
}

test("status tells a signed-in user whether the assistant is on", async () => {
  for (const enabled of [false, true]) {
    const { server, base } = await startApp(enabled);
    try {
      const anon = await fetch(`${base}/status`);
      assert.equal(anon.status, 401);
      const res = await fetch(`${base}/status`, { headers: { "x-tz": "100000009" } });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { ok: true, enabled });
    } finally {
      server.close();
    }
  }
});

test("while the assistant is off every chat and action route answers 404 AI_DISABLED and runs nothing", async () => {
  const { server, calls, base } = await startApp(false);
  const headers = { "x-tz": "100000009", "content-type": "application/json" };
  try {
    const requests = [
      fetch(`${base}/chat`, { method: "POST", headers, body: JSON.stringify({ message: "hi" }) }),
      fetch(`${base}/conversations`, { headers }),
      fetch(`${base}/conversations/0123456789abcdef01234567`, { headers }),
      fetch(`${base}/conversations/0123456789abcdef01234567`, { method: "DELETE", headers }),
      fetch(`${base}/actions/0123456789abcdef01234567/approve`, { method: "POST", headers }),
      fetch(`${base}/actions/0123456789abcdef01234567/cancel`, { method: "POST", headers }),
    ];
    for (const res of await Promise.all(requests)) {
      assert.equal(res.status, 404);
      assert.equal((await res.json()).code, "AI_DISABLED");
    }
    assert.deepEqual(calls, []);
  } finally {
    server.close();
  }
});
