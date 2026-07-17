import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure, parseJsonValue } from '../../shared/logicValues.js';

const legacyCases = config => {
    const cases = [];
    if (config.matchA !== '' && config.matchA !== undefined) cases.push({ value: config.matchA, handle: 'branchA' });
    if (config.matchB !== '' && config.matchB !== undefined) cases.push({ value: config.matchB, handle: 'branchB' });
    return cases;
};

const parseCases = config => {
    if (config.cases === undefined || config.cases === '') return legacyCases(config);
    const cases = parseJsonValue(config.cases, 'Cases');
    if (!Array.isArray(cases)) throw new Error('Cases must be a JSON array.');
    const handles = new Set();
    return cases.map((item, index) => {
        const handle = item?.handle;
        if (!item || typeof item !== 'object' || typeof handle !== 'string' || !handle.trim()) {
            throw new Error(`Case ${index + 1} must include a non-empty handle.`);
        }
        if (handles.has(handle)) throw new Error(`Case handle "${handle}" is duplicated.`);
        handles.add(handle);
        return { value: item.value, handle };
    });
};

const evaluateSwitch = config => {
    const valueToTest = config.valueToTest ?? config.input1 ?? '';
    const cases = parseCases(config);
    const matchedCase = cases.find(item => item.value === valueToTest);
    const targetHandle = matchedCase?.handle || config.defaultHandle || 'default';
    return {
        matchedValue: valueToTest,
        matchedCase: matchedCase || null,
        targetHandle
    };
};

export default class RouterSwitchNode extends BaseNode {
    async execute(context) {
        try {
            const result = evaluateSwitch(this.getResolvedConfig(context));
            return {
                success: true,
                outputData: result,
                ...result
            };
        } catch (error) {
            return nodeFailure('SWITCH_FAILED', error.message, { targetHandle: 'default' });
        }
    }
}

export { evaluateSwitch };
