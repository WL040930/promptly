const errorHandler = (err, req, res, next) => {
    // Preserve the original status code if set (e.g. 400, 401, 403, 404)
    // Fall back to 500 only for unexpected errors
    const status = err.status || err.statusCode || 500;
    
    if (status >= 500) {
        console.error(err.stack);
    }

    res.status(status).json({
        error: err.message || 'Something went wrong!'
    });
};

export default errorHandler;
