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
