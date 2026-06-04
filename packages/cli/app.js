import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import promptsRoutes from './routes/prompts.js';
import healthRoutes from './routes/health.js';
import errorHandler from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(helmet({
    contentSecurityPolicy: false, // Disabling CSP locally to avoid blocking frontend assets
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes'
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 requests per windowMs for auth routes
    message: 'Too many authentication attempts, please try again after 15 minutes'
});

app.use('/api/', generalLimiter);

app.get('/api', (req, res) => {
    res.json({
        message: 'Welcome to Promptly API',
        status: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

app.use('/api/health', healthRoutes);
app.use('/api/prompts', promptsRoutes);
app.use('/api/auth', authLimiter, authRoutes);

const frontendDir = join(__dirname, '../ui/dist');
app.use(express.static(frontendDir));

app.get('*', (req, res) => {
    res.sendFile(join(frontendDir, 'index.html'));
});

app.use(errorHandler);

export default app;
