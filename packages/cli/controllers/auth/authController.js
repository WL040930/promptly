import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import env from '../../config/env.js';
import { normalizeEmail, emailPattern, passwordPattern } from '../../utils/validators.js';

const createAuthToken = (user) =>
    jwt.sign({ sub: user.id, email: user.email }, env.jwt.secret, {
        expiresIn: env.jwt.expiresIn
    });

const register = async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (!emailPattern.test(email)) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (!passwordPattern.test(password)) {
        return res.status(400).json({
            error:
                'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.'
        });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
        return res.status(409).json({ error: 'Email already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash });
    const token = createAuthToken(user);

    return res.status(201).json({
        message: 'User registered successfully',
        user: { id: user.id, email: user.email, experienceLevel: user.experienceLevel },
        token
    });
};

const login = async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
        return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = createAuthToken(user);

    return res.json({
        message: 'Login successful',
        user: { id: user.id, email: user.email, experienceLevel: user.experienceLevel },
        token
    });
};

const updateMode = async (req, res) => {
    const { experienceLevel } = req.body;

    if (!['chat', 'builder'].includes(experienceLevel)) {
        return res.status(400).json({ error: 'Invalid mode selection.' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found.' });
    }

    user.experienceLevel = experienceLevel;
    await user.save();

    return res.json({
        message: 'Mode saved successfully.',
        user: {
            id: user.id,
            email: user.email,
            experienceLevel: user.experienceLevel
        }
    });
};

const getMe = async (req, res) => {
    const user = await User.findByPk(req.userId);
    if (!user) {
        return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({
        user: {
            id: user.id,
            email: user.email,
            experienceLevel: user.experienceLevel,
            googleEmail: user.googleEmail,
            googleId: user.googleId
        }
    });
};

export { register, login, updateMode, getMe };
