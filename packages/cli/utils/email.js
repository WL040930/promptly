import nodemailer from 'nodemailer';
import env from '../config/env.js';

const transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.port === 465, // true for 465, false for other ports
    auth: {
        user: env.smtp.user,
        pass: env.smtp.pass
    }
});

/**
 * Send an email asynchronously.
 * @param {Object} options - The email options.
 * @param {string} options.to - The recipient email.
 * @param {string} [options.cc] - Carbon-copy recipients.
 * @param {string} [options.bcc] - Blind-carbon-copy recipients.
 * @param {string} [options.replyTo] - Reply-To address.
 * @param {string} options.subject - The email subject.
 * @param {string} options.text - The plain text body.
 * @param {string} [options.html] - The HTML body (optional).
 */
export const sendEmail = async ({ to, cc, bcc, replyTo, subject, text, html }) => {
    const mailOptions = {
        from: env.smtp.from,
        to,
        cc,
        bcc,
        replyTo,
        subject,
        text,
        html
    };
    
    // Check if we have real SMTP credentials. If not, just log the email for development.
    if (env.smtp.host === 'smtp.example.com') {
        console.log(`[DEV EMAIL] To: ${to}`);
        console.log(`[DEV EMAIL] Subject: ${subject}`);
        console.log(`[DEV EMAIL] Body: \n${text}`);
        return;
    }

    return await transporter.sendMail(mailOptions);
};
