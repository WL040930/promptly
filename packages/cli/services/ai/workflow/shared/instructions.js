import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../instruction');

const read = name => fs.readFile(path.join(directory, name), 'utf8');

export const workflowPlannerInstruction = await read('workflow-planner.md');
export const workflowWorkerInstruction = await read('workflow-worker.md');
export const workflowVerifierInstruction = await read('workflow-verifier.md');

