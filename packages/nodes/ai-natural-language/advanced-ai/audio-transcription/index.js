import { BaseNode } from '../../../BaseNode.js';
import { downloadAsset } from '../../../../cli/services/storage/assetService.js';
import { transcribeAudio } from '../../../../cli/services/ai/media/transcriptionProvider.js';

export default class AudioTranscriptionNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { asset, buffer } = await downloadAsset({ id: config.assetId, userId: context.metadata?.userId });
        const result = await transcribeAudio({ buffer, filename: asset.originalName, mimeType: asset.mimeType, language: config.language, prompt: config.prompt, responseFormat: config.responseFormat, model: config.model });
        return { success: true, outputData: result, transcript: result.text, language: result.language, duration: result.duration, model: config.model };
    }
}
