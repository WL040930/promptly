import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure, parseFiniteNumber } from '../../shared/logicValues.js';

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
const MAX_UNTIL_MS = 365 * 24 * 60 * 60 * 1000;
const unitMultipliers = { milliseconds: 1, seconds: 1000, minutes: 60000, hours: 3600000 };

export const resolveDelay = config => {
    if (config.waitMode === 'until') {
        const resumeAt = new Date(config.resumeAt);
        if (Number.isNaN(resumeAt.getTime())) throw new Error('Resume time must be a valid date and time.');
        if (resumeAt.getTime() <= Date.now()) throw new Error('Resume time must be in the future.');
        const milliseconds = resumeAt.getTime() - Date.now();
        if (milliseconds > MAX_UNTIL_MS) throw new Error('Resume time cannot be more than one year away.');
        return { milliseconds, resumeAt: resumeAt.toISOString() };
    }
    const amount = parseFiniteNumber(config.delayAmount ?? 1, 'Delay amount');
    const unit = config.delayUnit || 'seconds';
    if (!Object.hasOwn(unitMultipliers, unit)) throw new Error(`Unsupported delay unit "${unit}".`);
    if (amount < 0) throw new Error('Delay amount cannot be negative.');
    const milliseconds = amount * unitMultipliers[unit];
    if (milliseconds > MAX_DURATION_MS) throw new Error('Delay cannot exceed 24 hours.');
    return { milliseconds, resumeAt: new Date(Date.now() + milliseconds).toISOString() };
};

export default class WaitDelayNode extends BaseNode {
    async execute(context) {
        try {
            const delay = resolveDelay(this.getResolvedConfig(context));
            if (context.metadata?.runType !== 'production') {
                await new Promise(resolve => setTimeout(resolve, Math.min(delay.milliseconds, 100)));
                return { success: true, outputData: delay, ...delay, delayedFor: delay.milliseconds };
            }
            return {
                success: true,
                outputData: delay,
                suspend: {
                    kind: 'wait',
                    availableAt: delay.resumeAt,
                    payload: { resumeAt: delay.resumeAt }
                }
            };
        } catch (error) {
            return nodeFailure('DELAY_FAILED', error.message, { delayedFor: 0 });
        }
    }
}
