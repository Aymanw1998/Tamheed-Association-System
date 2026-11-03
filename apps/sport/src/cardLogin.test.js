import { cardToken, signInFromCard } from "./cardLogin";

// Sign-in card (2026-11-01): the card's QR opens the site at /#card=<token>.

test("the token is read from #card= and nothing else", () => {
  expect(cardToken("#card=abc_DEF-123")).toBe("abc_DEF-123");
  expect(cardToken("#tab=notices")).toBe("");
  expect(cardToken("")).toBe("");
});

test("a card link signs in, then the token is wiped from the address bar", async () => {
  const calls = [];
  const loc = { hash: "#card=tok", pathname: "/", search: "?x=1" };
  const history = { replaceState: (...args) => calls.push(args) };
  const signIn = jest.fn(() => Promise.resolve({ ok: true }));
  const result = await signInFromCard({ location: loc, history, signIn });
  expect(signIn).toHaveBeenCalledWith("tok");
  expect(result).toEqual({ tried: true, ok: true, message: "" });
  expect(calls[0][2]).toBe("/?x=1");
});

test("a refused card is wiped too and gives the server's message", async () => {
  const calls = [];
  const signIn = () => Promise.resolve({ ok: false, data: { message: "البطاقة غير صالحة" } });
  const result = await signInFromCard({ location: { hash: "#card=bad", pathname: "/", search: "" }, history: { replaceState: (...a) => calls.push(a) }, signIn });
  expect(result).toEqual({ tried: true, ok: false, message: "البطاقة غير صالحة" });
  expect(calls).toHaveLength(1);
});

test("without a card link nothing is tried", async () => {
  const signIn = jest.fn();
  const result = await signInFromCard({ location: { hash: "", pathname: "/", search: "" }, history: { replaceState() {} }, signIn });
  expect(result).toEqual({ tried: false });
  expect(signIn).not.toHaveBeenCalled();
});
