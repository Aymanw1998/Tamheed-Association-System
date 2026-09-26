import { singleFlight } from "./singleFlight";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

test("callers that overlap share one request", async () => {
  const pending = deferred();
  const request = jest.fn(() => pending.promise);
  const refresh = singleFlight(request);

  const first = refresh();
  const second = refresh();
  pending.resolve("token-1");

  await expect(first).resolves.toBe("token-1");
  await expect(second).resolves.toBe("token-1");
  expect(request).toHaveBeenCalledTimes(1);
});

test("a call after the previous one settled sends a new request", async () => {
  const request = jest.fn().mockResolvedValueOnce("token-1").mockResolvedValueOnce("token-2");
  const refresh = singleFlight(request);

  await expect(refresh()).resolves.toBe("token-1");
  await expect(refresh()).resolves.toBe("token-2");
  expect(request).toHaveBeenCalledTimes(2);
});

test("a failure reaches every waiting caller and the next call retries", async () => {
  const pending = deferred();
  const request = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce("token-2");
  const refresh = singleFlight(request);

  const first = refresh();
  const second = refresh();
  pending.reject(new Error("401"));

  await expect(first).rejects.toThrow("401");
  await expect(second).rejects.toThrow("401");
  await expect(refresh()).resolves.toBe("token-2");
});
