# Tamheed: proposed Claude Code review payload

Prepared locally on 2026-09-14. Pending owner approval; no Claude review received.

You are Claude Code reviewing a bounded stability patch implemented by Codex. Review only the material below; do not access other files, invoke tools, edit code, or contact services. Return at most three concrete findings with file/line evidence and failure scenarios, or state that you found no actionable regression. Separate missing context from confirmed defects. Codex will answer findings and provide revised code if necessary. Do not launch another reviewer.

Intent: restrict non-admin self-edit to profile fields while preserving administrator management; preserve login on ordinary FORBIDDEN; bound raw refresh calls to 15 seconds; expire the production refresh cookie correctly; run isolated regression tests in CI. The existing profile form submits its full account object, so protected keys are ignored for non-admin users instead of rejecting otherwise valid profile saves.

Verification reported by Codex: 12 server and 4 client tests passed; client production build passed; syntax checks passed for 58 server JavaScript files. No real DB, production services, or external network was tested. Cross-caller refresh coordination and API initialization are outside this patch and still need assessment. This is a diff-only review; state limitations where surrounding code is needed.

## Existing-file patch

```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index b3ffe52..15a6780 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -26,6 +26,11 @@ jobs:
         env:
           CI: false
           REACT_APP_SERVER_URI: http://localhost:5000
+      - name: Client regression tests
+        run: npm test
+        working-directory: client
+        env:
+          CI: true
 
   server-check:
     name: Server syntax check
@@ -45,3 +50,6 @@ jobs:
           find . -name "*.js" -not -path "./node_modules/*" -print0 \
             | xargs -0 -n1 node --check
         working-directory: server
+      - name: Server regression tests
+        run: npm test
+        working-directory: server
diff --git a/client/package.json b/client/package.json
index 8f32b3d..a4820e9 100644
--- a/client/package.json
+++ b/client/package.json
@@ -26,7 +26,8 @@
   },
   "scripts": {
     "start": "react-scripts start",
-    "build": "react-scripts build"
+    "build": "react-scripts build",
+    "test": "react-scripts test --watchAll=false --runInBand"
   },
   "browserslist": {
     "production": [
diff --git a/client/src/Components/Routes/PublicOnly.jsx b/client/src/Components/Routes/PublicOnly.jsx
index ddbf301..8e1587f 100644
--- a/client/src/Components/Routes/PublicOnly.jsx
+++ b/client/src/Components/Routes/PublicOnly.jsx
@@ -51,7 +51,7 @@ export default function PublicOnly() {
         const { data } = await axios.post(
           `${API_BASE_URL}/auth/refresh`,
           {},
-          { withCredentials: true }
+          { withCredentials: true, timeout: 15000 }
         );
 
         if (!cancel && data?.accessToken && !navigatingRef.current) {
diff --git a/client/src/Components/Routes/RequireAuth.jsx b/client/src/Components/Routes/RequireAuth.jsx
index 7003f6e..0cfe09c 100644
--- a/client/src/Components/Routes/RequireAuth.jsx
+++ b/client/src/Components/Routes/RequireAuth.jsx
@@ -30,7 +30,7 @@ export default function RequireAuth() {
             const { data } = await axios.post(
               `${API_BASE_URL}/auth/refresh`,
               {},
-              { withCredentials: true }
+              { withCredentials: true, timeout: 15000 }
             );
 
             if (data?.accessToken) {
diff --git a/client/src/WebServer/services/api.jsx b/client/src/WebServer/services/api.jsx
index 6c17713..427c18b 100644
--- a/client/src/WebServer/services/api.jsx
+++ b/client/src/WebServer/services/api.jsx
@@ -132,6 +132,7 @@ api.interceptors.response.use(
         // ملاحظة عربية
         const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, null, {
           withCredentials: true,
+          timeout: 15000,
         });
 
         if (!data?.accessToken) {
@@ -167,7 +168,8 @@ api.interceptors.response.use(
     ) {
       hardResetToLogin('انتهت صلاحية الرمز');
     }
-    if (status === 403 && ['BLOCKED', 'FORBIDDEN'].includes(code)) {
+    // A denied operation does not invalidate an otherwise valid session.
+    if (status === 403 && code === 'BLOCKED') {
       hardResetToLogin('لا توجد صلاحية لهذا الحساب');
     }
 
diff --git a/client/src/WebServer/utils/accessScheduler.js b/client/src/WebServer/utils/accessScheduler.js
index 822f2f5..5a97d44 100644
--- a/client/src/WebServer/utils/accessScheduler.js
+++ b/client/src/WebServer/utils/accessScheduler.js
@@ -30,7 +30,7 @@ export function scheduleAccessRefresh(accessToken, skewMs = 60_000) {
     }
 
     try {
-      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true });
+      const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true, timeout: 15000 });
       if (data?.accessToken) {
         setAuthTokens(data.accessToken, data.expirationTime);
 
diff --git a/client/src/setupTests.js b/client/src/setupTests.js
index 7b0828b..f5d9cc0 100644
--- a/client/src/setupTests.js
+++ b/client/src/setupTests.js
@@ -1 +1 @@
-import '@testing-library/jest-dom';
+// Tests currently use Jest's built-in assertions; no extra matchers are required.
diff --git a/package.json b/package.json
index d35ddc1..77d98fa 100644
--- a/package.json
+++ b/package.json
@@ -4,6 +4,8 @@
   "description": "",
   "main": "index.js",
   "scripts": {
+    "test": "npm run test --prefix server && npm run test --prefix client",
+    "verify": "npm test && npm run build --prefix client",
     "setup": "node scripts/setup.js",
     "start": "concurrently \"npm run server\" \"npm run client\"",
     "server": "cd server && npm start",
diff --git a/server/Entities/User/User.controller.js b/server/Entities/User/User.controller.js
index 32428d1..39f9d0c 100644
--- a/server/Entities/User/User.controller.js
+++ b/server/Entities/User/User.controller.js
@@ -15,6 +15,7 @@ const {
 } = require("../../utils/jwt");
 
 const { logWithSource } = require("../../middleware/logger");
+const { repairMisencodedText } = require("../../utils/textEncoding");
 
 const {
   encryptPassword,
@@ -86,6 +87,10 @@ const buildUserPhotoName = (user = {}, file = {}) => {
 
 /* ================= Constants ================= */
 const ROOMS = ["active", "waiting", "noActive"];
+const SELF_EDIT_FIELDS = new Set([
+  "firstname", "lastname", "birth_date", "gender", "phone", "email",
+  "city", "street", "password", "photo",
+]);
 const MAX_ATTEMPTS = 5;
 const LOCK_MIN = 10;
 
@@ -368,11 +373,26 @@ const putU = async (req, res) => {
       return res.status(400).json({ ok: false, message: "tz required" });
     }
 
-    const room = req.body?.room && ROOMS.includes(req.body.room)
+    const roles = Array.isArray(req.user?.roles) ? req.user.roles : [];
+    const isAdmin = roles.some((role) =>
+      ADMIN_ROLES.has(repairMisencodedText(String(role).trim()))
+    );
+    if (!isAdmin && tz !== String(req.user?.tz ?? "").trim()) {
+      return res.status(403).json({ ok: false, code: "FORBIDDEN", message: "لا توجد صلاحية" });
+    }
+
+    const room = isAdmin && req.body?.room && ROOMS.includes(req.body.room)
       ? req.body.room
       : "active";
 
     const newData = removeEmpty(buildData(req.body));
+    if (!isAdmin) {
+      // The profile form sends back account metadata from getMe. Only editable
+      // profile fields may reach storage; authority and session state are server-owned.
+      for (const field of Object.keys(newData)) {
+        if (!SELF_EDIT_FIELDS.has(field)) delete newData[field];
+      }
+    }
 
     const updated = await UserModelDef.update({ tz }, newData, room);
 
diff --git a/server/package.json b/server/package.json
index 41dad80..a08e739 100644
--- a/server/package.json
+++ b/server/package.json
@@ -4,7 +4,7 @@
   "description": "",
   "main": "server.js",
   "scripts": {
-    "test": "echo \"Error: no test specified\" && exit 1",
+    "test": "node --test test/*.test.js",
     "start": "nodemon server.js",
     "dev": "nodemon",
     "data:clear": "node scripts/clearAllData.js --force",
diff --git a/server/utils/jwt.js b/server/utils/jwt.js
index 945644d..40e9b35 100644
--- a/server/utils/jwt.js
+++ b/server/utils/jwt.js
@@ -12,15 +12,19 @@ exports.computeAccessExpMsFromNow = () => Date.now() + ACCESS_TOKEN_TTL_SEC * 10
 
 exports.sha256 = (str) => crypto.createHash('sha256').update(String(str)).digest('hex');
 
-exports.setRefreshCookie = (res, token) => {
+const refreshCookieOptions = () => {
   const isProd = process.env.NODE_ENV === 'production';
-  res.cookie("refresh", token, {
+  return {
     httpOnly: true,
     secure: isProd,                 // prod فقط
     sameSite: isProd ? "None" : "Lax",
     path: "/",
     domain: isProd ? ".tamheed-ramla.org" : undefined,
-  });
+  };
+};
+
+exports.setRefreshCookie = (res, token) => {
+  res.cookie("refresh", token, refreshCookieOptions());
 };
 
-exports.clearRefreshCookie = (res) => res.clearCookie('refresh', { path: '/' });
+exports.clearRefreshCookie = (res) => res.clearCookie('refresh', refreshCookieOptions());
```

## New test: server/test/jwt.test.js

```javascript
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const express = require('express');
const { setRefreshCookie, clearRefreshCookie } = require('../utils/jwt');

function createResponse() {
  const response = new http.ServerResponse({ method: 'POST' });
  Object.setPrototypeOf(response, express.response);
  return response;
}

function parseCookieHeader(header) {
  const serialized = Array.isArray(header) ? header[0] : header;
  const [cookie, ...attributes] = serialized.split(';').map((part) => part.trim());
  return {
    cookie,
    attributes: Object.fromEntries(attributes.map((attribute) => {
      const separator = attribute.indexOf('=');
      return separator === -1
        ? [attribute.toLowerCase(), true]
        : [attribute.slice(0, separator).toLowerCase(), attribute.slice(separator + 1)];
    })),
  };
}

for (const environment of ['production', 'development']) {
  test(`logout expires the same refresh cookie set during ${environment} login`, (t) => {
    const originalEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = environment;
    t.after(() => {
      if (originalEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalEnvironment;
    });

    const loginResponse = createResponse();
    setRefreshCookie(loginResponse, 'test-refresh-token');
    const loginCookie = parseCookieHeader(loginResponse.getHeader('Set-Cookie'));

    const logoutResponse = createResponse();
    clearRefreshCookie(logoutResponse);
    const logoutCookie = parseCookieHeader(logoutResponse.getHeader('Set-Cookie'));

    assert.equal(loginCookie.cookie, 'refresh=test-refresh-token');
    assert.equal(logoutCookie.cookie, 'refresh=');
    assert.equal(logoutCookie.attributes.domain, loginCookie.attributes.domain);
    assert.equal(logoutCookie.attributes.path, loginCookie.attributes.path);
    assert.equal(logoutCookie.attributes.path, '/');
    assert.ok(Date.parse(logoutCookie.attributes.expires) < Date.now());

    for (const cookie of [loginCookie, logoutCookie]) {
      assert.equal(cookie.attributes.httponly, true);
      if (environment === 'production') {
        assert.equal(cookie.attributes.domain, '.tamheed-ramla.org');
        assert.equal(cookie.attributes.secure, true);
        assert.equal(cookie.attributes.samesite, 'None');
      } else {
        assert.equal(cookie.attributes.domain, undefined);
        assert.equal(cookie.attributes.secure, undefined);
        assert.equal(cookie.attributes.samesite, 'Lax');
      }
    }
  });
}
```

## New test: server/test/user-profile-authorization.test.js

```javascript
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Load the real handler with inert dependencies: importing the application
// normally initializes database, storage, email, and logging integrations.
function loadController() {
  const updates = [];
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async update(filter, data, room) {
          updates.push({ filter, data, room });
          return { success: true };
        },
      },
    },
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
    "../UploadFile/file": {},
    "../Storage/Storage.controller": {},
    "../Notification/Notification.controller": {},
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { putU: module.exports.putU, updates };
}

async function updateUser({ user, body, tz = "self-user" }) {
  const { putU, updates } = loadController();
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await putU({ params: { tz }, user, body }, res);
  // Convert objects created in the VM into this test's realm for strict equality.
  return { res, updates: JSON.parse(JSON.stringify(updates)) };
}

test("self-edit saves profile fields while ignoring authority and session metadata", async () => {
  const profile = {
    firstname: "Example",
    lastname: "User",
    birth_date: "2000-01-02",
    gender: "ذكر",
    phone: "+10000000000",
    email: "profile@example.test",
    city: "Example City",
    street: "Example Street",
    password: "new-profile-password",
    photo: "/example-profile.png",
  };
  const { res, updates } = await updateUser({
    user: { tz: "self-user", roles: ["مرشد"] },
    body: {
      ...profile,
      tz: "another-user",
      roles: ["ادارة"],
      main_lesson: "another-lesson",
      storageFolder: "another-users-folder",
      storagePermissions: { view: ["*"], create: ["*"], update: ["*"], delete: ["*"] },
      googleDrive: { refreshToken: "injected-token" },
      refreshHash: "injected-hash",
      resetOtpHash: "injected-otp",
      resetOtpExpires: "2099-01-01",
      resetOtpAttempts: 0,
      resetOtpLockedUntil: "2000-01-01",
      room: "waiting",
      futurePrivilegedField: true,
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates, [{
    filter: { tz: "self-user" },
    data: { ...profile, birth_date: "2000-01-02T00:00:00.000Z" },
    room: "active",
  }]);
});

test("missing roles cannot turn a request-body admin role into authorization", async () => {
  const { res, updates } = await updateUser({
    user: { tz: "self-user" },
    body: { firstname: "Updated", roles: ["ادارة"], room: "noActive" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates, [{
    filter: { tz: "self-user" }, data: { firstname: "Updated" }, room: "active",
  }]);
});

for (const role of ["ادارة", " إدارة ", "الادارة", "الإدارة", "Ø§Ø¯Ø§Ø±Ø©"]) {
  test(`administrator ${JSON.stringify(role)} retains user-management fields and room selection`, async () => {
    const body = {
      tz: "renamed-user",
      firstname: "Updated",
      roles: ["مساعد"],
      storageFolder: "assigned-folder",
      storagePermissions: { view: ["assigned-folder"] },
      main_lesson: "assigned-lesson",
      room: "waiting",
    };
    const { res, updates } = await updateUser({
      user: { tz: "admin-user", roles: [role] }, body,
    });
    assert.equal(res.statusCode, 200);
    const { room, ...data } = body;
    assert.deepEqual(updates, [{ filter: { tz: "self-user" }, data, room }]);
  });
}

test("administrator can manage their own account through the route's self branch", async () => {
  const { res, updates } = await updateUser({
    user: { tz: "self-user", roles: ["Ø§Ø¯Ø§Ø±Ø©"] },
    body: { roles: ["ادارة", "مرشد"] },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates[0].data, { roles: ["ادارة", "مرشد"] });
});

test("non-administrators cannot update another identity even if the handler is called directly", async () => {
  for (const user of [undefined, { tz: "other-user", roles: ["مساعد"] }]) {
    const { res, updates } = await updateUser({ user, body: { firstname: "Changed" } });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(updates, []);
  }
});

test("a partial profile save does not erase omitted or empty fields", async () => {
  const { res, updates } = await updateUser({
    user: { tz: "self-user", roles: [] },
    body: { firstname: "Updated", password: "", email: null, photo: null },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates[0].data, { firstname: "Updated" });
});
```

## New test: client/src/WebServer/services/api.test.js

```javascript
// Use Axios's CommonJS build with CRA's Jest runtime; no HTTP requests are sent.
jest.mock('axios', () => {
  const path = require('path');
  return jest.requireActual(path.join(
    path.dirname(require.resolve('axios/package.json')),
    'dist/node/axios.cjs'
  ));
});

import axios from 'axios';
import api, { getAuthToken, setAuthTokens } from './api';

const originalLocation = window.location;
const originalAdapter = api.defaults.adapter;

function rejectRequest(config, status, code) {
  return Promise.reject({ config, response: { status, data: { code } } });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete window.location;
  window.location = { assign: jest.fn() };
  setAuthTokens('valid-token', Date.now() + 60000);
});

afterEach(() => {
  jest.restoreAllMocks();
  api.defaults.adapter = originalAdapter;
  window.location = originalLocation;
});

test('a forbidden operation rejects the request without logging the user out', async () => {
  sessionStorage.setItem('draft', 'unsaved work');
  api.defaults.adapter = (config) => rejectRequest(config, 403, 'FORBIDDEN');

  await expect(api.get('/restricted')).rejects.toMatchObject({
    response: { status: 403, data: { code: 'FORBIDDEN' } },
  });

  expect(localStorage.getItem('accessToken')).toBe('valid-token');
  expect(getAuthToken()).toBe('valid-token');
  expect(sessionStorage.getItem('draft')).toBe('unsaved work');
  expect(window.location.assign).not.toHaveBeenCalled();
});

test('an explicitly blocked account still resets the session', async () => {
  api.defaults.adapter = (config) => rejectRequest(config, 403, 'BLOCKED');

  await expect(api.get('/profile')).rejects.toMatchObject({ response: { status: 403 } });

  expect(localStorage.getItem('accessToken')).toBeNull();
  expect(window.location.assign).toHaveBeenCalledWith('/');
});

test('a refresh timeout releases every waiting request and permits a later refresh', async () => {
  let rejectRefresh;
  const refresh = jest.spyOn(axios, 'post').mockImplementationOnce(() => new Promise((_, reject) => {
    rejectRefresh = reject;
  }));
  api.defaults.adapter = (config) => {
    if (config.headers.Authorization === 'Bearer renewed-token') {
      return Promise.resolve({ config, status: 200, data: { ok: true }, headers: {} });
    }
    return rejectRequest(config, 401, 'TOKEN_EXPIRED');
  };

  const pending = Promise.allSettled([api.get('/first'), api.get('/second')]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledWith(expect.stringContaining('/auth/refresh'), null, {
    withCredentials: true,
    timeout: 15000,
  });

  const timeout = Object.assign(new Error('Request timed out'), { code: 'ECONNABORTED' });
  rejectRefresh(timeout);
  const results = await pending;
  expect(results).toEqual([
    { status: 'rejected', reason: timeout },
    { status: 'rejected', reason: timeout },
  ]);

  refresh.mockResolvedValueOnce({ data: { accessToken: 'renewed-token', expirationTime: 12345 } });
  await expect(api.get('/retry')).resolves.toMatchObject({ status: 200 });
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(getAuthToken()).toBe('renewed-token');
});

test('concurrent expired requests share refresh and retry with the renewed token', async () => {
  let resolveRefresh;
  const refresh = jest.spyOn(axios, 'post').mockImplementation(() => new Promise((resolve) => {
    resolveRefresh = resolve;
  }));
  api.defaults.adapter = (config) => {
    if (config.headers.Authorization === 'Bearer renewed-token') {
      return Promise.resolve({ config, status: 200, data: { ok: true }, headers: {} });
    }
    return rejectRequest(config, 401, 'TOKEN_EXPIRED');
  };

  const pending = Promise.all([api.get('/first'), api.get('/second')]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(refresh).toHaveBeenCalledTimes(1);
  resolveRefresh({ data: { accessToken: 'renewed-token', expirationTime: 12345 } });

  const responses = await pending;
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect(localStorage.getItem('accessToken')).toBe('renewed-token');
  expect(window.location.assign).not.toHaveBeenCalled();
});
```
