import { BaseNode } from '../../../BaseNode.js';

export default class ConditionIfElseNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const { valueA = "", operator = "equals", valueB = "" } = config;

        let result = false;
        
        switch (operator) {
            case "equals":
            case "==":
                result = valueA == valueB;
                break;
            case "not_equals":
            case "!=":
                result = valueA != valueB;
                break;
            case "greater_than":
            case ">":
                result = Number(valueA) > Number(valueB);
                break;
            case "less_than":
            case "<":
                result = Number(valueA) < Number(valueB);
                break;
            case "contains":
                result = String(valueA).includes(String(valueB));
                break;
            case "exists":
                result = valueA !== undefined && valueA !== null && valueA !== "";
                break;
            default:
                result = false;
        }

        const targetHandle = result ? "true" : "false";

        // Return the routing handle so the execution engine knows which branch to take
        return { 
            success: true, 
            result, 
            targetHandle 
        };
    }
}
