const errorHandler = (err, req, res, next) => {
    // Preserve the original status code if set (e.g. 400, 401, 403, 404)
    // Fall back to 500 only for unexpected errors
    let status = err.status || err.statusCode || 500;
    let message = err.message || 'Something went wrong!';
    
    if (err.name === 'SequelizeForeignKeyConstraintError') {
        status = 409;
        message = 'This record is still referenced by related data.';
    }

    if (status >= 500) {
        console.error(err.stack);
    }

    res.status(status).json({
        error: message
    });
};

export default errorHandler;
