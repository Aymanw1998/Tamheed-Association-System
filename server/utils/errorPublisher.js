// server/utils/errorPublisher.js
// Server errors go to the log only. They used to be pushed to every open
// /api/events connection, signed in or not; that channel is gone. Only the
// path is logged: query strings can hold tokens or tickets.
const { recentErrors } = require('./recentErrors');

function errorPublisher(err, req, res, next) {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
        recentErrors.note(err, 'server');
        const code = err.code || 'SERVER_ERROR';
        console.error(`[server-error] ${status} ${code} ${req?.method || ''} ${req?.path || ''}: ${err.message || ''}`);
    }
    next(err);
}

module.exports = { errorPublisher };
