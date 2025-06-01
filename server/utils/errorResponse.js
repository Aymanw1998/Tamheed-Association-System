class errorResponse extends Error {
    constructor(message, statusCode = 401) {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
    }
}
module.exports = errorResponse;