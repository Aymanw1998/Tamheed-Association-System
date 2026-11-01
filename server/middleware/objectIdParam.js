// router.param handler: an :id that is not a MongoDB ObjectId cannot name any
// row, so it is answered 404 here instead of reaching the database (which
// would throw a cast error and answer 500 with its own English message).
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function objectIdParam(req, res, next, id) {
  if (OBJECT_ID.test(String(id))) return next();
  return res.status(404).json({ ok: false, message: "غير موجود" });
}

module.exports = { objectIdParam };
