// const ErrorResponse = require('../utils/errorResponse');

//for validation errore includes mongodn error ,400-500 errors
// instad of using joi-lib 
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log to console for dev
    console.log('name:::', err.name);
    console.log(err);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = `Resource not found by id of : ${err.value}`;
        error = new Error(message, 404);
    }

    // Mongoose duplicate key
    let message;
    if (err.code === 11000) {
        if (err.keyPattern.email)
            message = `Duplicate field value entered of email`;
        else if (err.keyPattern.tz)
            message = `Duplicate field value entered of usename`;
        else
            message = `Duplicate field value`;
        error = new Error(message, 400);
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message);
        error = new Error(message, 400);
    }

    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Server Error'
    });
}

module.exports = errorHandler;