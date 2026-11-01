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

// The owner's rule (2026-11-01): signed in until signing out, like a phone
// app. The refresh cookie outlives closing the browser (it has a lifetime,
// the refresh token's), and each refresh starts that lifetime again.
test('the refresh cookie is kept after the browser closes, for the refresh token lifetime', () => {
  const response = createResponse();
  setRefreshCookie(response, 'test-refresh-token');
  const { attributes } = parseCookieHeader(response.getHeader('Set-Cookie'));
  const { REFRESH_TOKEN_TTL_SEC } = require('../utils/jwt');
  assert.equal(Number(attributes['max-age']), REFRESH_TOKEN_TTL_SEC);
});

test('without settings, a refresh token lasts a year and an access token 15 minutes', () => {
  const saved = { a: process.env.JWT_ACCESS_TTL_SEC, r: process.env.JWT_REFRESH_TTL_SEC };
  delete process.env.JWT_ACCESS_TTL_SEC; delete process.env.JWT_REFRESH_TTL_SEC;
  try {
    delete require.cache[require.resolve('../utils/jwt')];
    const fresh = require('../utils/jwt');
    assert.equal(fresh.REFRESH_TOKEN_TTL_SEC, 365 * 24 * 60 * 60);
    assert.equal(fresh.ACCESS_TOKEN_TTL_SEC, 15 * 60);
  } finally {
    if (saved.a !== undefined) process.env.JWT_ACCESS_TTL_SEC = saved.a;
    if (saved.r !== undefined) process.env.JWT_REFRESH_TTL_SEC = saved.r;
    delete require.cache[require.resolve('../utils/jwt')];
  }
});

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
