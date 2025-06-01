const successResponse = (req, res, data) => {
    res.status(200).json({
    success: true,
    data
    })
};
exports.exports = successResponse;