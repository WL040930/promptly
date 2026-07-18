import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FORM_FIELD_TYPES } from '../../../../../shared/formContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const instructionDir = path.resolve(__dirname, '../instruction');

const FORM_FIELD_SEMANTICS = [
    'Canonical form field semantics:',
    '- rating: numeric scale; use maxRating for a bounded scale such as 1-5.',
    '- radio: exactly one option can be selected; choices are required.',
    '- checkbox: one or more options can be selected; choices are required.',
    '- select: dropdown where exactly one option can be selected; choices are required.',
    '- single_choice and multiple_choice are clarification-input types only, never form field types.'
].join('\n');

const readInstruction = (fileName, suffix = '') => {
    try {
        return `${fs.readFileSync(path.join(instructionDir, fileName), 'utf8')}${suffix}`;
    } catch (error) {
        console.error(`Failed to read form instruction ${fileName}:`, error);
        return suffix.trim() || `You are a Form AI ${fileName.replace('.md', '')}.`;
    }
};

export const plannerInstruction = readInstruction('planner.md', `\n\n${FORM_FIELD_SEMANTICS}`);
export const workerInstruction = readInstruction(
    'worker.md',
    `\n\nAuthoritative supported field types: ${FORM_FIELD_TYPES.join(', ')}.\n\n${FORM_FIELD_SEMANTICS}`
);
export const verifierInstruction = readInstruction('verifier.md', `\n\n${FORM_FIELD_SEMANTICS}`);
