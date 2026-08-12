import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import routes from './routes/routes.js';
import errorHandler from './middleware/errorHandler.js';
import requestTiming from './middleware/requestTiming.js';
import env from './config/env.js';
import { robotsDirectiveForPath, sitemapPaths } from '../shared/siteSeo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

const publicOriginFor = req => {
    const configuredOrigin = env.app.siteUrl || env.app.publicOrigin;
    if (configuredOrigin) return configuredOrigin.replace(/\/$/, '');
    return `${req.protocol}://${req.get('host')}`;
};

const sitemapXmlFor = origin => {
    const urls = sitemapPaths().map(path => `  <url><loc>${origin}${path}</loc></url>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
};

app.use(helmet({
    contentSecurityPolicy: false, // Disabling CSP locally to avoid blocking frontend assets
}));
app.use(cors({ origin: env.app.clientOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestTiming);
app.use(compression({
    filter: (req, res) => {
        // Streaming AI responses must not be buffered by compression.
        if (String(req.headers.accept || '').includes('text/event-stream')) return false;
        return compression.filter(req, res);
    }
}));

app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
        const directive = robotsDirectiveForPath(req.path);
        if (directive.startsWith('noindex')) res.setHeader('X-Robots-Tag', directive);
    }
    next();
});

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use('/api/', generalLimiter);

app.get('/api', (req, res) => {
    res.json({
        message: 'Welcome to Promptly API',
        status: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

app.use('/api', routes);

app.get('/robots.txt', (req, res) => {
    const origin = publicOriginFor(req);
    res.type('text/plain').send([
        'User-agent: *',
        'Allow: /',
        'Disallow: /app/',
        'Disallow: /onboarding',
        'Disallow: /login',
        'Disallow: /register',
        'Disallow: /forgot-password',
        'Disallow: /reset-password/',
        'Disallow: /f/',
        `Sitemap: ${origin}/sitemap.xml`
    ].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml').send(sitemapXmlFor(publicOriginFor(req)));
});

app.get('/landing/security', (req, res) => {
    res.redirect(301, '/security');
});

const frontendDir = join(__dirname, '../ui/dist');
app.use(express.static(frontendDir, {
    index: false,
    maxAge: '1y',
    immutable: true
}));

app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(frontendDir, 'index.html'));
});

app.use(errorHandler);

export default app;
