// server/utils/errorPublisher.js
const { broadcast } = require('./sse');

function errorPublisher(err, req, res, next) {
    const status = err.status || 500;
    const code = err.code || 'SERVER_ERROR';

    broadcast({
        level: status >= 500 ? 'error' : 'warning',
        title: `שגיאה ${status}`,
        message: `${code}: ${err.message || 'תקלה כללית'}`,
    });

    next(err);
}

module.exports = { errorPublisher };
