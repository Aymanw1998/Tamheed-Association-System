const express = require("express");

// Photos as the app shows them.
//   GET /passport/:fileId   public: the passport version (white background,
//                           35:45) of the student's or user's photo stored in
//                           Drive as `fileId`; until it is made (or when no
//                           picture could be made), a redirect to the photo
//                           itself.
// Public like the photo links themselves (lh3.googleusercontent.com/d/<id>,
// readable by anyone with the link): an <img> cannot send the Authorization
// header, and the address needs the Drive file id the link already holds.
const FILE_ID = /^[\w-]{10,200}$/;

function createPhotoRouter({ passport, files }) {
  const router = express.Router();

  router.get("/passport/:fileId", async (req, res) => {
    const fileId = String(req.params.fileId || "");
    if (!FILE_ID.test(fileId)) return res.status(404).end();
    let found = null;
    try {
      found = await passport.read(fileId);
    } catch {
      found = null; // the photo itself still shows
    }
    res.set("X-Content-Type-Options", "nosniff");
    if (!found) {
      // Asked again next time: the passport version may be ready by then.
      res.set("Cache-Control", "no-store");
      return res.redirect(302, files.toViewUrl(fileId));
    }
    res.set("Content-Type", found.contentType);
    // A row never changes for its file id; an hour so a removed photo does
    // not linger long in browsers.
    res.set("Cache-Control", "public, max-age=3600");
    return res.status(200).send(found.image);
  });

  return router;
}

module.exports = createPhotoRouter({
  passport: require("../../services/passportPhotoJob").passportPhotoJob,
  files: require("../../services/googleDrive.service"),
});
module.exports.createPhotoRouter = createPhotoRouter;
