import { Asset, AutomationRun, Connection, Form, Workflow } from '../../models/index.js';
import { getGoogleClientForUser } from '../triggers/googleTriggerClient.js';

const GOOGLE_CONNECT_ACTION = Object.freeze({
    label: 'Connect Google',
    href: '/app/settings/connections'
});

export class NodeResourceError extends Error {
    constructor(message, { code = 'NODE_RESOURCE_FAILED', status = 500, action = null } = {}) {
        super(message);
        this.name = 'NodeResourceError';
        this.code = code;
        this.status = status;
        this.action = action;
    }
}

const plain = record => record?.toJSON ? record.toJSON() : record;
const option = (value, label, description = null, metadata = null) => ({
    value: String(value),
    label: String(label || value),
    ...(description ? { description: String(description) } : {}),
    ...(metadata ? { metadata } : {})
});

const quoteSheetTitle = value => `'${String(value || 'Sheet1').replaceAll("'", "''")}'`;

const googleFormId = value => {
    const source = String(value || '').trim();
    const match = source.match(/docs\.google\.com\/forms\/d(?:\/e)?\/([a-zA-Z0-9_-]+)/i);
    return match?.[1] || source;
};

const googleSpreadsheetId = value => {
    const source = String(value || '').trim();
    const match = source.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
    return match?.[1] || source;
};

const columnName = count => {
    let current = Math.max(1, Math.min(Number(count) || 26, 18278));
    let result = '';
    while (current > 0) {
        current -= 1;
        result = String.fromCharCode(65 + (current % 26)) + result;
        current = Math.floor(current / 26);
    }
    return result;
};

const googleClient = async (getClient, userId) => {
    try {
        return await getClient(userId);
    } catch (error) {
        throw new NodeResourceError('Connect Google to browse spreadsheets and Gmail providers.', {
            code: 'GOOGLE_CONNECTION_REQUIRED',
            status: 409,
            action: GOOGLE_CONNECT_ACTION
        });
    }
};

const googleRequest = async (client, request, missingScopeMessage) => {
    try {
        return await client.request(request);
    } catch (error) {
        const status = Number(error?.response?.status || error?.code || 0);
        if ([401, 403].includes(status)) {
            throw new NodeResourceError(missingScopeMessage, {
                code: 'GOOGLE_RECONNECT_REQUIRED',
                status: 409,
                action: { ...GOOGLE_CONNECT_ACTION, label: 'Reconnect Google' }
            });
        }
        throw new NodeResourceError('Google resources could not be loaded. Try again.', {
            code: 'GOOGLE_RESOURCE_FAILED',
            status: 502
        });
    }
};

const listModel = async (model, query, mapper) => {
    const records = await model.findAll(query);
    return records.map(plain).map(mapper);
};

export const createNodeResourceService = ({
    models = { Asset, AutomationRun, Connection, Form, Workflow },
    getGoogleClient = getGoogleClientForUser
} = {}) => {
    const executionModel = models.AutomationRun;
    const providers = {
        forms: async ({ userId }) => ({
            options: await listModel(models.Form, {
                where: { userId },
                attributes: ['id', 'title', 'updatedAt'],
                order: [['updatedAt', 'DESC']],
                limit: 100
            }, record => option(record.id, record.title || 'Untitled form', 'Promptly form')),
            emptyMessage: 'Create a form first, then return here to select it.'
        }),
        workflows: async ({ userId }) => ({
            options: await listModel(models.Workflow, {
                where: { userId },
                attributes: ['id', 'name', 'status', 'updatedAt'],
                order: [['updatedAt', 'DESC']],
                limit: 100
            }, record => option(record.id, record.name || 'Untitled automation', record.status || 'Draft')),
            emptyMessage: 'No automations are available yet.'
        }),
        'email-providers': async ({ userId }) => {
            const connection = await models.Connection.findOne({ where: { userId, provider: 'google', status: 'active' } });
            return {
                options: [
                    option('system-default', 'Promptly email', 'Send with the workspace email provider'),
                    ...(connection ? [option('user-gmail', `Gmail · ${connection.accountEmail || 'connected account'}`, 'Send from your connected Google account')] : [])
                ],
                ...(connection ? {} : { action: GOOGLE_CONNECT_ACTION }),
                emptyMessage: 'Promptly email is always available.'
            };
        },
        'google-spreadsheets': async ({ userId }) => {
            const { client, connection } = await googleClient(getGoogleClient, userId);
            const params = new URLSearchParams({
                q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
                fields: 'files(id,name,modifiedTime,webViewLink)',
                orderBy: 'modifiedTime desc',
                pageSize: '100'
            });
            const response = await googleRequest(client, {
                url: `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
                method: 'GET'
            }, 'Reconnect Google to grant spreadsheet browsing access.');
            return {
                options: (response.data?.files || []).map(file => option(
                    file.id,
                    file.name || 'Untitled spreadsheet',
                    file.modifiedTime ? `Updated ${new Date(file.modifiedTime).toLocaleDateString('en-CA')}` : null,
                    { url: file.webViewLink || null }
                )),
                account: connection?.accountEmail || null,
                emptyMessage: 'No Google Sheets are visible to this connection. You can paste a spreadsheet URL or ID.'
            };
        },
        'google-spreadsheet': async ({ userId, params }) => {
            const spreadsheetId = googleSpreadsheetId(params.spreadsheetId);
            if (!/^[a-zA-Z0-9_-]{20,200}$/.test(spreadsheetId)) {
                return { options: [], emptyMessage: 'Paste a valid Google Sheets URL or ID.' };
            }
            const { client, connection } = await googleClient(getGoogleClient, userId);
            const response = await googleRequest(client, {
                url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}?fields=id,name,mimeType,webViewLink`,
                method: 'GET'
            }, 'Reconnect Google to verify spreadsheet access.');
            const file = response.data || {};
            if (file.mimeType !== 'application/vnd.google-apps.spreadsheet') {
                return { options: [], emptyMessage: 'That link is not a Google Sheet.' };
            }
            return {
                options: [option(file.id, file.name || 'Google Sheet', 'Verified Google Sheet', { url: file.webViewLink || null })],
                account: connection?.accountEmail || null,
                emptyMessage: 'That Google Sheet could not be verified.'
            };
        },
        'google-forms': async ({ userId }) => {
            const { client, connection } = await googleClient(getGoogleClient, userId);
            const params = new URLSearchParams({
                q: "mimeType='application/vnd.google-apps.form' and trashed=false",
                fields: 'files(id,name,modifiedTime,webViewLink)',
                orderBy: 'modifiedTime desc',
                pageSize: '100'
            });
            const response = await googleRequest(client, {
                url: `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
                method: 'GET'
            }, 'Reconnect Google to browse your Google Forms.');
            return {
                options: (response.data?.files || []).map(file => option(
                    file.id,
                    file.name || 'Untitled Google Form',
                    file.modifiedTime ? `Updated ${new Date(file.modifiedTime).toLocaleDateString('en-CA')}` : 'Google Form',
                    { url: file.webViewLink || null }
                )),
                account: connection?.accountEmail || null,
                emptyMessage: 'No Google Forms are visible to this connection.'
            };
        },
        'google-form-response-sheet': async ({ userId, params }) => {
            const formId = googleFormId(params.formId);
            if (!/^[a-zA-Z0-9_-]{8,200}$/.test(formId)) {
                return { options: [], emptyMessage: 'Select a Google Form first.' };
            }
            const { client, connection } = await googleClient(getGoogleClient, userId);
            const response = await googleRequest(client, {
                url: `https://forms.googleapis.com/v1/forms/${encodeURIComponent(formId)}`,
                method: 'GET'
            }, 'Reconnect Google to grant Google Forms access.');
            const linkedSheetId = String(response.data?.linkedSheetId || '').trim();
            const formTitle = String(response.data?.info?.title || response.data?.info?.documentTitle || 'Google Form').trim();
            return {
                options: linkedSheetId ? [option(linkedSheetId, formTitle, 'Linked response Sheet')] : [],
                metadata: { formId, formTitle, linkedSheetId: linkedSheetId || null },
                account: connection?.accountEmail || null,
                emptyMessage: linkedSheetId
                    ? 'The linked response Sheet is ready.'
                    : 'This Google Form does not have a linked response Sheet.'
            };
        },
        'google-drive-files': async ({ userId }) => {
            const { client, connection } = await googleClient(getGoogleClient, userId);
            const response = await googleRequest(client, { url: 'https://www.googleapis.com/drive/v3/files?q=trashed=false&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=100', method: 'GET' }, 'Reconnect Google to grant Drive access.');
            return { options: (response.data?.files || []).map(file => option(file.id, file.name || 'Untitled file', file.mimeType || 'Drive file', { url: file.webViewLink || null })), account: connection?.accountEmail || null, emptyMessage: 'No Drive files are visible to this connection.' };
        },
        'google-calendars': async ({ userId }) => {
            const { client, connection } = await googleClient(getGoogleClient, userId);
            const response = await googleRequest(client, { url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=100', method: 'GET' }, 'Reconnect Google to grant Calendar access.');
            return { options: (response.data?.items || []).map(calendar => option(calendar.id, calendar.summary || calendar.id, calendar.description || 'Google Calendar', { timeZone: calendar.timeZone })), account: connection?.accountEmail || null, emptyMessage: 'No calendars are available.' };
        },
        'google-calendar-events': async ({ userId, params }) => {
            const calendarId = String(params.calendarId || '').trim();
            if (!calendarId) return { options: [], emptyMessage: 'Select a calendar first.' };
            const { client, connection } = await googleClient(getGoogleClient, userId);
            const response = await googleRequest(client, { url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}&maxResults=100`, method: 'GET' }, 'Reconnect Google to grant Calendar access.');
            return { options: (response.data?.items || []).map(event => option(event.id, event.summary || '(Untitled event)', event.start?.dateTime || event.start?.date || 'Upcoming event')), account: connection?.accountEmail || null, emptyMessage: 'No upcoming events are available.' };
        },
        'google-sheet-ranges': async ({ userId, params }) => {
            const spreadsheetId = String(params.spreadsheetId || '').trim();
            if (!/^[a-zA-Z0-9_-]{20,200}$/.test(spreadsheetId)) {
                return { options: [], emptyMessage: 'Select a spreadsheet first.' };
            }
            const { client } = await googleClient(getGoogleClient, userId);
            const response = await googleRequest(client, {
                url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))`,
                method: 'GET'
            }, 'Reconnect Google to grant spreadsheet access.');
            return {
                options: (response.data?.sheets || []).map(sheet => {
                    const properties = sheet.properties || {};
                    const rowCount = Math.max(1, Number(properties.gridProperties?.rowCount) || 1000);
                    const columns = columnName(properties.gridProperties?.columnCount || 26);
                    const range = `${quoteSheetTitle(properties.title)}!A1:${columns}${rowCount}`;
                    return option(range, properties.title || 'Sheet', `${columns} columns · ${rowCount} rows`, { sheetId: properties.sheetId });
                }),
                parentLabel: response.data?.properties?.title || null,
                emptyMessage: 'No sheets were found in this spreadsheet.'
            };
        },
        'workflow-assets': async ({ userId }) => ({
            options: await listModel(models.Asset, {
                where: { userId, status: 'clean' },
                attributes: ['id', 'originalName', 'mimeType', 'byteSize', 'createdAt'],
                order: [['createdAt', 'DESC']],
                limit: 100
            }, record => option(record.id, record.originalName, `${record.mimeType} · ${record.byteSize} bytes`)),
            emptyMessage: 'Upload a file asset first.'
        }),
        'promptly-records': async ({ userId, params }) => {
            const resource = String(params.resource || 'forms');
            if (resource === 'forms') return providers.forms({ userId });
            if (resource === 'workflows') return providers.workflows({ userId });
            if (resource === 'executionLogs') {
                return {
                    options: await listModel(executionModel, {
                        where: { userId },
                        attributes: ['id', 'workflowId', 'status', 'createdAt'],
                        order: [['createdAt', 'DESC']],
                        limit: 100
                    }, record => option(record.id, `${record.status || 'Run'} · ${record.id.slice(0, 12)}`, record.workflowId ? `Automation ${record.workflowId}` : 'Execution log')),
                    emptyMessage: 'No execution logs are available.'
                };
            }
            throw new NodeResourceError(`Unsupported Promptly resource "${resource}".`, { code: 'NODE_RESOURCE_PARAMS_INVALID', status: 400 });
        }
    };

    const list = async ({ userId, resource, params = {} }) => {
        if (!userId) throw new NodeResourceError('Authentication is required.', { code: 'AUTH_REQUIRED', status: 401 });
        const provider = providers[resource];
        if (!provider) throw new NodeResourceError(`Unknown node resource provider "${resource}".`, { code: 'NODE_RESOURCE_UNKNOWN', status: 404 });
        const result = await provider({ userId, params });
        return {
            resource,
            options: Array.isArray(result.options) ? result.options.slice(0, 100) : [],
            emptyMessage: result.emptyMessage || 'No options are available.',
            ...(result.action ? { action: result.action } : {}),
            ...(result.account ? { account: result.account } : {}),
            ...(result.parentLabel ? { parentLabel: result.parentLabel } : {}),
            ...(result.metadata ? { metadata: result.metadata } : {})
        };
    };

    return Object.freeze({ list });
};

const nodeResourceService = createNodeResourceService();
export default nodeResourceService;
