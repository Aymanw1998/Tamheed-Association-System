import { createSseParser } from "./assistantStream";

const collect = () => {
  const events = [];
  const parser = createSseParser((event) => events.push(event));
  return { events, parser };
};

test("parses one complete event with JSON data", () => {
  const { events, parser } = collect();
  parser.push('event: delta\ndata: {"text":"مرحبا"}\n\n');
  expect(events).toEqual([{ event: "delta", data: { text: "مرحبا" } }]);
});

test("parses several events in one chunk, in order", () => {
  const { events, parser } = collect();
  parser.push('event: conversation\ndata: {"id":"c1","title":"t"}\n\nevent: delta\ndata: {"text":"a"}\n\nevent: done\ndata: {}\n\n');
  expect(events.map((e) => e.event)).toEqual(["conversation", "delta", "done"]);
  expect(events[0].data).toEqual({ id: "c1", title: "t" });
});

test("joins an event split across chunks, even inside a line or a multi-byte char boundary of text", () => {
  const { events, parser } = collect();
  parser.push("event: del");
  parser.push('ta\ndata: {"te');
  expect(events).toEqual([]);
  parser.push('xt":"שלום"}\n');
  expect(events).toEqual([]);
  parser.push("\n");
  expect(events).toEqual([{ event: "delta", data: { text: "שלום" } }]);
});

test("handles CRLF line endings and ignores comments (pings)", () => {
  const { events, parser } = collect();
  parser.push(": ping\r\n\r\nevent: tool\r\ndata: {\"name\":\"search_students\"}\r\n\r\n");
  expect(events).toEqual([{ event: "tool", data: { name: "search_students" } }]);
});

test("joins multi-line data with newlines and defaults the event to message", () => {
  const { events, parser } = collect();
  parser.push('data: {"a":\ndata: 1}\n\n');
  expect(events).toEqual([{ event: "message", data: { a: 1 } }]);
});

test("skips events whose data is not JSON instead of throwing", () => {
  const { events, parser } = collect();
  parser.push("event: delta\ndata: not json\n\nevent: done\ndata: {}\n\n");
  expect(events).toEqual([{ event: "done", data: {} }]);
});

test("a block with no data lines is not dispatched (per the SSE spec)", () => {
  const { events, parser } = collect();
  parser.push("event: done\n\nevent: delta\ndata: {\"text\":\"x\"}\n\n");
  expect(events).toEqual([{ event: "delta", data: { text: "x" } }]);
  parser.push("event: done");
  parser.end();
  expect(events).toHaveLength(1);
});

test("an empty data line yields an empty object", () => {
  const { events, parser } = collect();
  parser.push("event: done\ndata:\n\n");
  expect(events).toEqual([{ event: "done", data: {} }]);
});

test("end() flushes a final event that lacks the blank line", () => {
  const { events, parser } = collect();
  parser.push('event: done\ndata: {}');
  expect(events).toEqual([]);
  parser.end();
  expect(events).toEqual([{ event: "done", data: {} }]);
  parser.end();
  expect(events).toHaveLength(1);
});

test("accepts 'data:' without the optional space", () => {
  const { events, parser } = collect();
  parser.push('event:delta\ndata:{"text":"x"}\n\n');
  expect(events).toEqual([{ event: "delta", data: { text: "x" } }]);
});
