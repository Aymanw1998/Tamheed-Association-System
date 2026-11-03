// One record per ID number in each students/users collection, kept by MongoDB
// itself: the check before a save cannot stop two saves of the same moment.
// Records without an ID number are left out of the index.
const TZ_UNIQUE_INDEX = { key: { tz: 1 }, options: { unique: true, partialFilterExpression: { tz: { $gt: "" } } } };

// MongoDB's duplicate-key error (E11000): the unique index refused the write.
const isDuplicateKey = (err) => Boolean(err) && (err.code === 11000 || /E11000/.test(String(err.message)));

module.exports = { TZ_UNIQUE_INDEX, isDuplicateKey };
