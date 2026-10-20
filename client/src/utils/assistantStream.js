// A small Server-Sent Events parser for the assistant's POST /api/ai/chat
// stream (EventSource cannot POST or send the Authorization header, so the
// stream is read through fetch). Feed it decoded text chunks in any split;
// it calls onEvent({ event, data }) once per complete event, with `data`
// parsed as JSON. Comments (": ping") are ignored, and an event whose data is
// not JSON is skipped.
//
//   const parser = createSseParser(onEvent);
//   parser.push(chunk); ...; parser.end();

export function createSseParser(onEvent) {
  let buffer = "";
  let eventName = "";
  let dataLines = [];

  // Per the SSE spec, a block without any data line dispatches nothing.
  const dispatch = () => {
    const name = eventName || "message";
    const lines = dataLines;
    eventName = "";
    dataLines = [];
    if (lines.length === 0) return;
    const raw = lines.join("\n");
    let data = {};
    if (raw.trim()) {
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
    }
    if (typeof onEvent === "function") onEvent({ event: name, data });
  };

  const line = (text) => {
    if (text === "") return dispatch();
    if (text.startsWith(":")) return undefined;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? "" : text.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") {
      eventName = value;
    } else if (field === "data") {
      dataLines.push(value);
    }
    return undefined;
  };

  return {
    push(chunk) {
      buffer += String(chunk ?? "");
      let index = buffer.search(/\r\n|\r|\n/);
      while (index !== -1) {
        // A lone "\r" at the end may be the first half of "\r\n": wait for more.
        if (buffer[index] === "\r" && index === buffer.length - 1) break;
        const size = buffer.startsWith("\r\n", index) ? 2 : 1;
        line(buffer.slice(0, index));
        buffer = buffer.slice(index + size);
        index = buffer.search(/\r\n|\r|\n/);
      }
    },
    end() {
      if (buffer) {
        line(buffer.replace(/\r$/, ""));
        buffer = "";
      }
      dispatch();
    },
  };
}
