import { BaseNode } from '../../../BaseNode.js';
import { getGoogleClientForUser } from '../../../../cli/services/triggers/googleTriggerClient.js';
import { downloadAsset, createAsset } from '../../../../cli/services/storage/assetService.js';

const driveRequest = (client, request) => client.request({ ...request, url: request.url.startsWith('http') ? request.url : `https://www.googleapis.com/drive/v3${request.url}` });

export default class GoogleDriveNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const userId = context.metadata?.userId;
        const { client } = await getGoogleClientForUser(userId);
        if (config.operation === 'search') {
            const query = String(config.query || '').replaceAll("'", "\\'");
            const response = await driveRequest(client, { url: `/files?q=name contains '${query}' and trashed=false&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=50`, method: 'GET' });
            const files = response.data?.files || [];
            return { success: true, outputData: { files }, files };
        }
        if (config.operation === 'download') {
            const response = await driveRequest(client, { url: `/files/${encodeURIComponent(config.fileId)}?alt=media`, method: 'GET', responseType: 'arraybuffer' });
            const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
            const metadata = await driveRequest(client, { url: `/files/${encodeURIComponent(config.fileId)}?fields=id,name,mimeType,size,webViewLink`, method: 'GET' });
            const asset = await createAsset({ userId, buffer, originalName: metadata.data?.name || 'drive-file', mimeType: metadata.data?.mimeType || 'application/octet-stream', workflowId: context.metadata?.workflowId, runId: context.metadata?.runId, source: 'google-drive' });
            return { success: true, outputData: { assetId: asset.id, fileId: config.fileId, metadata: metadata.data }, assetId: asset.id, fileId: config.fileId, webViewLink: metadata.data?.webViewLink || null };
        }
        const { asset, buffer } = await downloadAsset({ id: config.assetId, userId });
        const boundary = `promptly_${Date.now()}`;
        const metadata = { name: config.fileName || asset.originalName, mimeType: asset.mimeType, ...(config.folderId ? { parents: [config.folderId] } : {}) };
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Type: ${asset.mimeType}\r\n\r\n`), buffer,
            Buffer.from(`\r\n--${boundary}--`)
        ]);
        const response = await client.request({ url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, data: body });
        return { success: true, outputData: response.data, fileId: response.data?.id, webViewLink: response.data?.webViewLink || null };
    }
}
