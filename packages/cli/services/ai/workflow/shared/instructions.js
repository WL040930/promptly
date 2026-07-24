import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../instruction');

const read = name => fs.readFile(path.join(directory, name), 'utf8');

export const workflowPlannerInstruction = await read('planner-v2.md');
export const workflowWorkerInstruction = await read('worker-v2.md');
export const workflowVerifierInstruction = await read('verifier-v2.md');

