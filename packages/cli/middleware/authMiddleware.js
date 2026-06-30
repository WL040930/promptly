import jwt from 'jsonwebtoken';
import env from '../config/env.js';

export const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token required.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, env.jwt.secret);
        req.user = { id: decoded.sub };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired authorization token.' });
    }
};
