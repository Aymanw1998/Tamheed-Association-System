const { recentErrors } = require('../utils/recentErrors');

// @desc    Logs request to console
const logger = (req, res, next) => {
    // console.log(
    //     `${req.method} ${req.protocol}://${req.get('host')}${req.originalUrl}`
    // );
    next();
};

function logWithSource(...args) {
    // The exact error of this request, for «الإبلاغ عن مشكلة».
    const error = args.find((arg) => arg instanceof Error);
    if (error) recentErrors.note(error, typeof args[0] === "string" ? args[0] : "");

    const stack = new Error().stack;
    const callerLine = stack.split('\n')[2]; // ملاحظة عربية
    const match = callerLine.match(/\((.*):(\d+):(\d+)\)/); // path:line:col

    if (match) {
        const [, file, line, col] = match;
        console.log(`[${file}:${line}]`, ...args);
    } else {
        console.log('[unknown location]', ...args);
    }
}

module.exports = {logger, logWithSource};

