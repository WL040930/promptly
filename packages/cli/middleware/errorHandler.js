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
        console.error('Unhandled request error', {
            name: err.name,
            message: err.message || err.original?.message,
            code: err.code || err.original?.code,
            method: req.method,
            path: req.originalUrl,
            stack: err.stack
        });
    }

    const payload = { error: message };
    if (err.code) payload.code = err.code;
    if (err.issues) payload.issues = err.issues;
    if (err.action) payload.action = err.action;
    res.status(status).json(payload);
};

export default errorHandler;
