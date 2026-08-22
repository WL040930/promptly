import crypto from 'node:crypto';

const EMAIL_PATTERN = /^[^\s@<>(),;:\\]+@[^\s@<>(),;]+\.[^\s@<>(),;]+$/;
const MAX_SUBJECT_LENGTH = 255;
const MAX_BODY_LENGTH = 1024 * 1024;
export const MAX_RECIPIENTS = 100;

export const parseRecipients = value => {
    const values = Array.isArray(value) ? value : String(value ?? '').split(/[,;]/);
    const recipients = values.map(item => String(item).trim()).filter(Boolean);
    if (recipients.length === 0) throw new Error('At least one email recipient is required.');
    if (recipients.length > MAX_RECIPIENTS) throw new Error(`Email cannot have more than ${MAX_RECIPIENTS} recipients.`);
    for (const recipient of recipients) {
        if (!EMAIL_PATTERN.test(recipient)) throw new Error(`Invalid email recipient: ${recipient}`);
    }
    return recipients;
};

const assertHeaderSafe = (value, fieldName) => {
    if (/[\r\n]/.test(String(value))) throw new Error(`${fieldName} cannot contain line breaks.`);
};

export const validateEmailMessage = message => {
    const to = parseRecipients(message.to);
    const hasRecipients = value => Array.isArray(value)
        ? value.length > 0
        : Boolean(String(value ?? '').trim());
    const cc = hasRecipients(message.cc) ? parseRecipients(message.cc) : [];
    const bcc = hasRecipients(message.bcc) ? parseRecipients(message.bcc) : [];
    const replyTo = hasRecipients(message.replyTo) ? parseRecipients(message.replyTo) : [];
    const subject = String(message.subject ?? '').trim();
    const text = String(message.text ?? '');
    const html = message.html === undefined || message.html === null ? '' : String(message.html);

    if (!subject) throw new Error('Email subject is required.');
    if (subject.length > MAX_SUBJECT_LENGTH) throw new Error(`Email subject cannot exceed ${MAX_SUBJECT_LENGTH} characters.`);
    assertHeaderSafe(subject, 'Email subject');
    if (!text && !html) throw new Error('Email must contain text or HTML content.');
    if (text.length > MAX_BODY_LENGTH || html.length > MAX_BODY_LENGTH) throw new Error('Email body cannot exceed 1 MB.');

    return { to, cc, bcc, replyTo, subject, text, html };
};

const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const rowCell = (row, column) => {
    const exact = Object.hasOwn(row, column)
        ? column
        : Object.keys(row).find(key => key.toLocaleLowerCase() === String(column).toLocaleLowerCase());
    return exact === undefined ? undefined : row[exact];
};

const templateValue = value => Array.isArray(value) ? value.join(', ') : String(value ?? '');

/** Render [[Column name]] using a single row. HTML insertions are escaped. */
export const renderRowTemplate = ({ template, row, html = false, rowIndex = null }) => String(template ?? '').replace(/\[\[([^\]]+)\]\]/g, (_token, rawColumn) => {
    const column = String(rawColumn || '').trim();
    const value = rowCell(row, column);
    if (value === undefined) {
        const prefix = rowIndex === null ? '' : `Row ${rowIndex + 1}: `;
        throw new Error(`${prefix}email template refers to missing column '${column}'.`);
    }
    const rendered = templateValue(value);
    return html ? escapeHtml(rendered) : rendered;
});

const normalizeRows = value => {
    let rows = value;
    if (typeof rows === 'string') {
        try { rows = JSON.parse(rows); } catch { throw new Error('Rows to email must be a JSON array or connected row data.'); }
    }
    if (!Array.isArray(rows) || rows.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) {
        throw new Error('Rows to email must be an array of row objects. Connect a Filter Rows step or supply row objects.');
    }
    return rows;
};

/**
 * Materialize and validate every private message before any delivery is
 * queued. Repeated recipients are deduplicated deterministically by their
 * first matched row.
 */
export const buildIndividualRowMessages = ({ rows, recipientColumn, subject, text, html, cc, bcc, replyTo }) => {
    const normalizedRows = normalizeRows(rows);
    const column = String(recipientColumn || '').trim();
    if (!column) throw new Error('Recipient column is required for individual row emails.');

    const messages = [];
    const seenRecipients = new Set();
    let skippedDuplicates = 0;
    for (const [rowIndex, row] of normalizedRows.entries()) {
        const recipientValue = rowCell(row, column);
        if (recipientValue === undefined || recipientValue === null || String(recipientValue).trim() === '') {
            throw new Error(`Row ${rowIndex + 1} has no value for recipient column '${column}'.`);
        }
        const rendered = {
            to: recipientValue,
            cc: renderRowTemplate({ template: cc, row, rowIndex }),
            bcc: renderRowTemplate({ template: bcc, row, rowIndex }),
            replyTo: renderRowTemplate({ template: replyTo, row, rowIndex }),
            subject: renderRowTemplate({ template: subject, row, rowIndex }),
            text: renderRowTemplate({ template: text, row, rowIndex }),
            html: renderRowTemplate({ template: html, row, html: true, rowIndex })
        };
        const validated = validateEmailMessage(rendered);
        for (const recipient of validated.to) {
            const dedupeKey = recipient.toLocaleLowerCase();
            if (seenRecipients.has(dedupeKey)) {
                skippedDuplicates += 1;
                continue;
            }
            seenRecipients.add(dedupeKey);
            if (messages.length >= MAX_RECIPIENTS) {
                throw new Error(`Individual row email cannot have more than ${MAX_RECIPIENTS} unique recipients.`);
            }
            messages.push({ ...validated, to: [recipient] });
        }
    }
    if (messages.length === 0) throw new Error('No unique recipient emails were found in the matching rows.');
    return { messages, recipientCount: messages.length, skippedDuplicates };
};

const encodeHeader = value => /^[\x00-\x7F]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`;

export const buildRawMimeMessage = message => {
    const normalized = validateEmailMessage(message);
    const headers = [
        `To: ${normalized.to.join(', ')}`,
        normalized.cc.length ? `Cc: ${normalized.cc.join(', ')}` : null,
        normalized.bcc.length ? `Bcc: ${normalized.bcc.join(', ')}` : null,
        normalized.replyTo.length ? `Reply-To: ${normalized.replyTo.join(', ')}` : null,
        `Subject: ${encodeHeader(normalized.subject)}`,
        'MIME-Version: 1.0'
    ].filter(Boolean);

    if (!normalized.html) {
        headers.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit', '', normalized.text);
        return headers.join('\r\n');
    }

    const boundary = `promptly_${crypto.randomUUID()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit', '', normalized.text,
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit', '', normalized.html,
        `--${boundary}--`);
    return headers.join('\r\n');
};

export const isRetryableEmailError = error => {
    const responseCode = Number(error?.responseCode || error?.status || error?.code);
    return [408, 421, 425, 450, 451, 452, 429, 500, 502, 503, 504].includes(responseCode) ||
        ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ESOCKET'].includes(error?.code);
};

export const withRetries = async (operation, { maxRetries = 2, shouldRetry = isRetryableEmailError, wait = () => Promise.resolve() } = {}) => {
    let attempts = 0;
    while (true) {
        attempts += 1;
        try {
            const result = await operation(attempts);
            return { result, attempts };
        } catch (error) {
            if (!shouldRetry(error) || attempts > maxRetries) {
                error.attempts = attempts;
                throw error;
            }
            await wait(attempts);
        }
    }
};
