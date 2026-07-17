import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Op } from 'sequelize';
import User from '../../models/core/User.js';
import env from '../../config/env.js';
import { normalizeEmail, emailPattern, passwordPattern } from '../../utils/validators.js';
import { sendEmail } from '../../utils/email.js';
import { getResetPasswordHtml } from '../../utils/emailTemplates.js';

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

    const user = await User.findByPk(req.user.id);
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
    const user = await User.findByPk(req.user.id);
    if (!user) {
        return res.status(401).json({ error: 'User not found.' });
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

export const forgotPassword = async (req, res) => {
    const email = normalizeEmail(req.body.email);
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
        // Return 200 to prevent email enumeration
        return res.json({ message: 'If that email address is in our database, we will send you an email to reset your password.' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour from now
    await user.save();

    // Use frontend URL for the link using the client origin environment variable
    const resetUrl = `${env.app.clientOrigin}/reset-password/${resetToken}`;

    const message = `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n`
        + `Please click on the following link, or paste this into your browser to complete the process:\n\n`
        + `${resetUrl}\n\n`
        + `If you did not request this, please ignore this email and your password will remain unchanged.\n`;

    const htmlMessage = getResetPasswordHtml(resetUrl);

    sendEmail({
        to: user.email,
        subject: 'Reset Your Promptly Password',
        text: message,
        html: htmlMessage
    }).catch(err => console.error('Failed to send password reset email:', err));

    res.json({ message: 'If that email address is in our database, we will send you an email to reset your password.' });
};

export const resetPassword = async (req, res) => {
    const { token } = req.params;
    const password = String(req.body.password || '');

    if (!passwordPattern.test(password)) {
        return res.status(400).json({
            error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.'
        });
    }

    const user = await User.findOne({
        where: {
            resetPasswordToken: token,
            resetPasswordExpires: { [Op.gt]: new Date() }
        }
    });

    if (!user) {
        return res.status(400).json({ error: 'Password reset token is invalid or has expired.' });
    }

    user.passwordHash = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Your password has been successfully reset.' });
};

export const changePassword = async (req, res) => {
    const { newPassword } = req.body;

    if (!newPassword) {
        return res.status(400).json({ error: 'New password is required.' });
    }

    const user = await User.findByPk(req.user.id);
    if (!user) {
        return res.status(404).json({ error: 'User not found.' });
    }

    // Validate new password pattern
    if (!passwordPattern.test(newPassword)) {
        return res.status(400).json({
            error: 'New password must be at least 12 characters and include uppercase, lowercase, number, and symbol.'
        });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.json({ message: 'Password updated successfully.' });
};

export { register, login, updateMode, getMe };
