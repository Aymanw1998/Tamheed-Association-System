// @desc    Logs request to console
const logger = (req, res, next) => {
    // console.log(
    //     `${req.method} ${req.protocol}://${req.get('host')}${req.originalUrl}`
    // );
    next();
};

function logWithSource(...args) {
    const stack = new Error().stack;
    const callerLine = stack.split('\n')[2]; // שורת הקריאה
    const match = callerLine.match(/\((.*):(\d+):(\d+)\)/); // path:line:col

    if (match) {
        const [, file, line, col] = match;
        console.log(`[${file}:${line}]`, ...args);
    } else {
        console.log('[unknown location]', ...args);
    }
}

module.exports = {logger, logWithSource};

