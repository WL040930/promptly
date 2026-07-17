import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure, parseFiniteNumber } from '../../shared/logicValues.js';

const MAX_DELAY_MS = 24 * 60 * 60 * 1000;
const unitMultipliers = { milliseconds: 1, seconds: 1000, minutes: 60000, hours: 3600000 };

export const resolveDelay = config => {
    const amount = parseFiniteNumber(config.delayAmount ?? 1, 'Delay amount');
    const unit = config.delayUnit || 'seconds';
    if (!Object.hasOwn(unitMultipliers, unit)) throw new Error(`Unsupported delay unit "${unit}".`);
    if (amount < 0) throw new Error('Delay amount cannot be negative.');
    const milliseconds = amount * unitMultipliers[unit];
    if (milliseconds > MAX_DELAY_MS) throw new Error('Delay cannot exceed 24 hours.');
    return { milliseconds, resumeAt: new Date(Date.now() + milliseconds).toISOString() };
};

export default class WaitDelayNode extends BaseNode {
    async execute(context) {
        try {
            const delay = resolveDelay(this.getResolvedConfig(context));
            await new Promise(resolve => setTimeout(resolve, delay.milliseconds));
            return { success: true, outputData: delay, ...delay, delayedFor: delay.milliseconds };
        } catch (error) {
            return nodeFailure('DELAY_FAILED', error.message, { delayedFor: 0 });
        }
    }
}
