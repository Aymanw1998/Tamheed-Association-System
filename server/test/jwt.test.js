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
