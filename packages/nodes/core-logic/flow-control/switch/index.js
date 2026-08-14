import { BaseNode } from '../../../BaseNode.js';
import { nodeFailure, parseJsonValue } from '../../shared/logicValues.js';

const branchHandles = new Set(['branchA', 'branchB']);

export const parseSwitchCases = config => {
    if (config.cases === undefined || config.cases === '') return [];
    const cases = parseJsonValue(config.cases, 'Cases');
    if (!Array.isArray(cases)) throw new Error('Cases must be a JSON array.');
    if (cases.length > branchHandles.size) throw new Error('Switch supports at most two case routes.');
    const handles = new Set();
    return cases.map((item, index) => {
        const handle = item?.handle;
        if (!item || typeof item !== 'object' || typeof handle !== 'string' || !handle.trim()) {
            throw new Error(`Case ${index + 1} must include a non-empty handle.`);
        }
        if (!branchHandles.has(handle)) {
            throw new Error(`Case handle "${handle}" must be branchA or branchB.`);
        }
        if (handles.has(handle)) throw new Error(`Case handle "${handle}" is duplicated.`);
        handles.add(handle);
        return { value: item.value, handle };
    });
};

const evaluateSwitch = config => {
    const valueToTest = config.valueToTest ?? config.input1 ?? '';
    const cases = parseSwitchCases(config);
    const matchedCase = cases.find(item => item.value === valueToTest);
    const targetHandle = matchedCase?.handle || 'default';
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
