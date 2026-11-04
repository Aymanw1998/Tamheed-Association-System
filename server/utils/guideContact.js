const { can, isSystemTz, isHiddenUser } = require("./permissions");

// A guide as shown with a student (its responsible guide) or a lesson (its
// teacher or helper): full name and phone to anyone who can see the record
// (owner's decision, 2026-10-31). The tz, which opens the guide's page, goes
// only to users.view holders. Nothing else of the user record goes out.
function guideContact(user, actor) {
  if (!user || isHiddenUser(user)) return null;
  const contact = {
    name: `${user.firstname || ""} ${user.lastname || ""}`.trim(),
    phone: String(user.phone || ""),
  };
  if (can(actor, "users.view")) contact.tz = String(user.tz || "");
  return contact;
}

// The contact of the active user with this _id, or null. Only a 24-hex id is
// looked up: lessons can hold a malformed helper id, and querying it would
// throw a CastError and fail the whole read.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
async function contactById(userModel, id, actor) {
  if (id == null || !OBJECT_ID.test(String(id))) return null;
  const found = await userModel.get({ _id: String(id) }, "active");
  return guideContact(found?.result?.[0], actor);
}

module.exports = { guideContact, contactById };
