const assert = require("node:assert/strict");
const test = require("node:test");
const { isValidIsraeliId } = require("../utils/israeliId");

// Check digits worked by hand: weights 1,2,1,2,... and digit sums of products.
// 123456782 -> 1+4+3+8+5+3+7+7+2 = 40; 000000018 -> 2+8 = 10.
test("Israeli ID numbers are accepted only with a correct check digit", () => {
  const cases = [
    ["123456782", true],
    ["000000018", true],
    [" 123456782 ", true],
    ["123456789", false],
    ["12345678a", false],
    ["1234", false],
    ["1234567820", false],
    ["", false],
    [undefined, false],
  ];
  for (const [value, want] of cases) {
    assert.equal(isValidIsraeliId(value), want, String(value));
  }
});
