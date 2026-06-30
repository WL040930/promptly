export const getResetPasswordHtml = (resetUrl) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fc; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
        .header { background-color: #4f46e5; padding: 30px 40px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
        .content { padding: 40px; color: #334155; line-height: 1.6; font-size: 16px; }
        .content h2 { color: #0f172a; margin-top: 0; font-size: 20px; }
        .button-container { text-align: center; margin: 35px 0; }
        .button { background-color: #4f46e5; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block; }
        .footer { background-color: #f8fafc; padding: 24px 40px; text-align: center; color: #94a3b8; font-size: 14px; border-top: 1px solid #e2e8f0; }
        .muted { color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Promptly</h1>
        </div>
        <div class="content">
            <h2>Password Reset Request</h2>
            <p>Hello,</p>
            <p>You are receiving this email because a password reset was requested for your Promptly account.</p>
            <div class="button-container">
                <a href="${resetUrl}" class="button" style="background-color: #4f46e5; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; display: inline-block;">Reset Password</a>
            </div>
            <p>If the button doesn't work, you can copy and paste the following link into your browser:</p>
            <p class="muted"><a href="${resetUrl}" style="color: #4f46e5; word-break: break-all;">${resetUrl}</a></p>
            <p>If you didn't request this, you can safely ignore this email. Your password will remain unchanged and the link will expire in 1 hour.</p>
        </div>
        <div class="footer">
            &copy; ${new Date().getFullYear()} Promptly. All rights reserved.
        </div>
    </div>
</body>
</html>
`;
