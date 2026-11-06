// Tests currently use Jest's built-in assertions; no extra matchers are required.
// CRA's Jest 27/jsdom does not provide the encoding globals used by Router 7.
const { TextEncoder, TextDecoder } = require("util");
if (!global.TextEncoder) global.TextEncoder = TextEncoder;
if (!global.TextDecoder) global.TextDecoder = TextDecoder;
