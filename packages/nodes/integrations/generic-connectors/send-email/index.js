import { BaseNode } from '../../../BaseNode.js';
import User from '../../../../cli/models/User.js';
import { sendEmail } from '../../../../cli/utils/email.js';
import { OAuth2Client } from 'google-auth-library';
import env from '../../../../cli/config/env.js';

const DEBUG_PREFIX = '[DEBUG-send-email]';

function isDebugEnabled() {
    return process.env.SEND_EMAIL_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
}

function preview(value, maxLength = 160) {
    if (value === undefined) return '<undefined>';
    if (value === null) return '<null>';
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    const singleLine = String(raw).replace(/\s+/g, ' ').trim();
    return singleLine.length > maxLength
        ? `${singleLine.slice(0, maxLength)}...`
        : singleLine;
}

function findVariableTokens(value) {
    if (typeof value !== 'string') return [];
    return Array.from(value.matchAll(/\{\{([^{}]+)\}\}/g)).map(match => match[0]);
}

function summarizeConfig(config) {
    return {
        emailProvider: config?.emailProvider,
        toType: typeof config?.to,
        to: preview(config?.to),
        subjectType: typeof config?.subject,
        subject: preview(config?.subject),
        bodyType: typeof config?.body,
        bodyLength: typeof config?.body === 'string' ? config.body.length : null,
        unresolvedTokens: {
            to: findVariableTokens(config?.to),
            subject: findVariableTokens(config?.subject),
            body: findVariableTokens(config?.body),
        },
    };
}

function summarizeContext(context) {
    const nodeFieldKeys = Object.entries(context || {})
        .filter(([, value]) => value && typeof value === 'object' && value.fields && typeof value.fields === 'object')
        .map(([key, value]) => ({ node: key, fieldKeys: Object.keys(value.fields) }));

    return {
        topLevelKeys: Object.keys(context || {}),
        metadata: context?.metadata,
        initialPayloadFieldKeys: context?.initialPayload?.fields
            ? Object.keys(context.initialPayload.fields)
            : [],
        nodeFieldKeys,
    };
}

function logDebug(label, details) {
    if (isDebugEnabled()) {
        console.log(`${DEBUG_PREFIX} ${label}`, JSON.stringify(details, null, 2));
    }
}

function logFailure(label, details) {
    console.error(`${DEBUG_PREFIX} ${label}`, JSON.stringify(details, null, 2));
}

function assertUsableEmailConfig(config, context) {
    const { to, subject, body } = config;

    if (!to || !subject || !body) {
        logFailure('missing-required-config', {
            resolvedConfig: summarizeConfig(config),
            context: summarizeContext(context),
        });
        throw new Error('Send Email node requires "to", "subject", and "body"');
    }

    const unresolved = Object.entries({
        to: findVariableTokens(to),
        subject: findVariableTokens(subject),
        body: findVariableTokens(body),
    }).filter(([, tokens]) => tokens.length > 0);

    if (unresolved.length > 0) {
        logFailure('unresolved-variables', {
            unresolved: Object.fromEntries(unresolved),
            resolvedConfig: summarizeConfig(config),
            context: summarizeContext(context),
        });
        throw new Error(`Send Email node has unresolved variables: ${unresolved.map(([field]) => field).join(', ')}`);
    }

    if (typeof to !== 'string' || !to.trim()) {
        logFailure('invalid-recipient-type', {
            resolvedConfig: summarizeConfig(config),
            context: summarizeContext(context),
        });
        throw new Error('Send Email node "to" must resolve to a non-empty email address');
    }

    const hasEmailLikeRecipient = /[^\s@<>(),;]+@[^\s@<>(),;]+\.[^\s@<>(),;]+/.test(to);
    if (!hasEmailLikeRecipient) {
        logFailure('invalid-recipient-value', {
            resolvedConfig: summarizeConfig(config),
            context: summarizeContext(context),
        });
        throw new Error(`Send Email node "to" did not resolve to a valid email address: ${preview(to)}`);
    }
}

export default class SendEmailNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { emailProvider = 'system-default', to, subject, body } = config;

        logDebug('execute-start', {
            nodeId: this.id,
            nodeTitle: this.title,
            rawConfig: summarizeConfig(this.config),
            resolvedConfig: summarizeConfig(config),
            context: summarizeContext(context),
        });

        assertUsableEmailConfig(config, context);

        let messageId = null;

        if (emailProvider === 'user-gmail') {
            const userId = context.metadata?.userId;
            if (!userId) {
                throw new Error('Missing user context for OAuth email provider');
            }

            const user = await User.findByPk(userId);
            if (!user || !user.googleAccessToken) {
                throw new Error('User has not connected their Google account or missing access token');
            }

            const oauth2Client = new OAuth2Client(
                env.google.clientId,
                env.google.clientSecret
            );

            oauth2Client.setCredentials({
                access_token: user.googleAccessToken,
                refresh_token: user.googleRefreshToken
            });

            const makeEmail = (toEmail, emailSubject, emailBody) => {
                const str = [
                    `To: ${toEmail}`,
                    `Subject: ${emailSubject}`,
                    `MIME-Version: 1.0`,
                    `Content-Type: text/plain; charset="UTF-8"`,
                    '',
                    emailBody,
                ].join('\r\n');
                return Buffer.from(str).toString('base64url');
            };

            const raw = makeEmail(to, subject, body);

            try {
                const response = await oauth2Client.request({
                    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
                    method: 'POST',
                    data: { raw }
                });
                
                messageId = response.data.id;
            } catch (err) {
                logFailure('gmail-error', {
                    error: err.message,
                    resolvedConfig: summarizeConfig(config),
                    context: summarizeContext(context),
                });
                throw new Error(`Failed to send email via Gmail: ${err.message}`);
            }

        } else {
            // System Default (SMTP)
            try {
                const mailInfo = await sendEmail({
                    to,
                    subject,
                    text: body
                });
                messageId = mailInfo?.messageId || 'dev-mode-mock-id';
            } catch (err) {
                logFailure('smtp-error', {
                    error: err.message,
                    resolvedConfig: summarizeConfig(config),
                    context: summarizeContext(context),
                });
                throw new Error(`Failed to send email via system SMTP: ${err.message}`);
            }
        }

        return { 
            ...context, 
            success: true,
            messageId,
            to,
            subject
        };
    }
}
