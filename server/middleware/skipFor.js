// skipFor(paths, middleware): runs `middleware` on every request except those
// whose path is one of `paths` (case-insensitive, trailing slash ignored, the
// way Express matches routes). Used to keep xss-clean off the assistant's chat
// message, which must reach the model and storage as typed ("<3" stays "<3");
// the chat window only ever renders it as text.
const normalize = (path) => String(path || "").toLowerCase().replace(/\/+$/, "") || "/";

function skipFor(paths, middleware) {
  const skipped = new Set(paths.map(normalize));
  return function skipForMiddleware(req, res, next) {
    if (skipped.has(normalize(req.path))) return next();
    return middleware(req, res, next);
  };
}

module.exports = { skipFor };
