import { performance } from 'node:perf_hooks';
import env from '../config/env.js';

const requestTiming = (req, res, next) => {
    const startedAt = performance.now();
    res.on('finish', () => {
        const elapsedMs = performance.now() - startedAt;
        if (elapsedMs < env.app.slowRequestMs) return;
        const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : req.baseUrl || req.path;
        console.warn(`[Perf] slow request ${Math.round(elapsedMs)}ms ${req.method} ${route} -> ${res.statusCode}`);
    });
    next();
};

export default requestTiming;
