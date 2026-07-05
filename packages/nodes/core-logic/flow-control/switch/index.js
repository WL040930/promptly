import { BaseNode } from '../../../BaseNode.js';

export default class RouterSwitchNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { valueToTest = "", matchA = "", matchB = "" } = config;

        let targetHandle = "default";

        if (valueToTest === matchA) {
            targetHandle = "branchA";
        } else if (valueToTest === matchB) {
            targetHandle = "branchB";
        }

        return { 
            success: true, 
            matchedValue: valueToTest,
            targetHandle 
        };
    }
}
