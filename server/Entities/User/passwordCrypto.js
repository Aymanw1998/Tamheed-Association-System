// passwordCrypto.js
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

const KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX;
if (!KEY_HEX) throw new Error('Missing PASSWORD_ENC_KEY_HEX in env');

if (!/^[0-9a-fA-F]{64}$/.test(KEY_HEX)) {
  throw new Error('PASSWORD_ENC_KEY_HEX must be exactly 64 hex characters');
}

const KEY = Buffer.from(KEY_HEX, 'hex');
if (KEY.length !== 32) {
  throw new Error(`PASSWORD_ENC_KEY_HEX must be 32 bytes (got ${KEY.length})`);
}

function encryptPassword(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);

  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

function isEncrypted(val) {
  if (typeof val !== 'string') return false;
  const parts = val.split('.');
  return parts.length === 4 && parts[0] === 'enc';
}

function decryptPassword(payload) {
  if (!isEncrypted(payload)) throw new Error('Not encrypted payload');

  const [, ivB64, tagB64, dataB64] = payload.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);

  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

module.exports = { encryptPassword, decryptPassword, isEncrypted, safeEqual };
