import { getGoogleClientForUser } from '../triggers/googleTriggerClient.js';

const SHEETS_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_CONNECTION_ACTION = Object.freeze({ label: 'Reconnect Google', href: '/app/settings/connections' });
const MAX_TITLE_LENGTH = 180;

export class GoogleSpreadsheetError extends Error {
    constructor(message, { code = 'GOOGLE_SPREADSHEET_FAILED', status = 502, action = null } = {}) {
        super(message);
        this.name = 'GoogleSpreadsheetError';
        this.code = code;
        this.status = status;
        this.action = action;
    }
}

const cleanTitle = (value, fallback) => {
    const title = String(value || '').trim().replace(/[\r\n]+/g, ' ');
    if (!title) return fallback;
    return title.slice(0, MAX_TITLE_LENGTH);
};

const driveQueryValue = value => String(value || '').replaceAll("'", "\\'");

const request = async (client, options, message) => {
    try {
        return await client.request(options);
    } catch (error) {
        const status = Number(error?.response?.status || error?.code || 0);
        if ([401, 403].includes(status)) {
            throw new GoogleSpreadsheetError('Reconnect Google to create and use spreadsheets.', {
                code: 'GOOGLE_RECONNECT_REQUIRED', status: 409, action: GOOGLE_CONNECTION_ACTION
            });
        }
        throw new GoogleSpreadsheetError(message || 'Google Sheets could not be updated. Try again.', { status: status || 502 });
    }
};

const clientFor = async (getGoogleClient, userId) => {
    try {
        return await getGoogleClient(userId);
    } catch {
        throw new GoogleSpreadsheetError('Connect Google before creating a spreadsheet.', {
            code: 'GOOGLE_CONNECTION_REQUIRED', status: 409, action: { ...GOOGLE_CONNECTION_ACTION, label: 'Connect Google' }
        });
    }
};

const headerRow = headers => (Array.isArray(headers) ? headers : [])
    .map(header => String(header || '').trim())
    .filter(Boolean)
    .slice(0, 100);

/**
 * Owns Google Sheet provisioning at the external-service seam.  The caller
 * supplies a durable key; a retry looks up the app-created Drive file before
 * creating anything, so an interrupted proposal apply never makes duplicates.
 */
export const createGoogleSpreadsheetService = ({ getGoogleClient = getGoogleClientForUser } = {}) => ({
    async createAndInitialize({ userId, title, sheetTitle = 'Responses', headers = [], provisioningKey, folderId = null } = {}) {
        if (!userId) throw new GoogleSpreadsheetError('Authentication is required.', { code: 'AUTH_REQUIRED', status: 401 });
        if (!provisioningKey) throw new GoogleSpreadsheetError('A spreadsheet provisioning key is required.', { code: 'GOOGLE_PROVISIONING_KEY_REQUIRED', status: 400 });
        const { client } = await clientFor(getGoogleClient, userId);
        const safeTitle = cleanTitle(title, 'Promptly responses');
        const safeSheetTitle = cleanTitle(sheetTitle, 'Responses');
        const key = String(provisioningKey).slice(0, 240);
        const lookup = new URLSearchParams({
            q: `appProperties has { key='promptlyProvisioningKey' and value='${driveQueryValue(key)}' } and trashed=false`,
            fields: 'files(id,name,webViewLink)', pageSize: '2'
        });
        const existing = await request(client, {
            url: `https://www.googleapis.com/drive/v3/files?${lookup.toString()}`, method: 'GET'
        }, 'Google Drive could not check an existing spreadsheet.');
        let file = existing.data?.files?.[0] || null;
        if (!file) {
            const created = await request(client, {
                url: 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
                method: 'POST',
                data: {
                    name: safeTitle,
                    mimeType: SHEETS_MIME_TYPE,
                    appProperties: { promptlyProvisioningKey: key },
                    ...(folderId ? { parents: [String(folderId)] } : {})
                }
            }, 'Google Drive could not create the spreadsheet.');
            file = created.data;
        }
        if (!file?.id) throw new GoogleSpreadsheetError('Google Drive did not return the new spreadsheet ID.');

        const metadata = await request(client, {
            url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}?fields=sheets.properties(sheetId,title)`, method: 'GET'
        }, 'Google Sheets could not prepare the spreadsheet.');
        const firstSheet = metadata.data?.sheets?.[0]?.properties;
        if (!firstSheet?.sheetId && firstSheet?.sheetId !== 0) throw new GoogleSpreadsheetError('The new spreadsheet has no writable sheet.');
        await request(client, {
            url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}:batchUpdate`,
            method: 'POST',
            data: { requests: [{ updateSheetProperties: { properties: { sheetId: firstSheet.sheetId, title: safeSheetTitle }, fields: 'title' } }] }
        }, 'Google Sheets could not prepare the destination tab.');
        const values = headerRow(headers);
        if (values.length) {
            await request(client, {
                url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}/values/${encodeURIComponent(`'${safeSheetTitle.replaceAll("'", "''")}'!A1`)}?valueInputOption=RAW`,
                method: 'PUT', data: { range: `'${safeSheetTitle.replaceAll("'", "''")}'!A1`, majorDimension: 'ROWS', values: [values] }
            }, 'Google Sheets could not write the response columns.');
        }
        return { id: file.id, name: file.name || safeTitle, sheetTitle: safeSheetTitle, range: `'${safeSheetTitle.replaceAll("'", "''")}'!A1`, webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}` };
    }
});

export default createGoogleSpreadsheetService();
