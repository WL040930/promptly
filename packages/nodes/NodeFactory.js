import { TriggerNode } from './trigger/TriggerNode.js';
import { ActionNode } from './action/ActionNode.js';
import { AINode } from './ai/AINode.js';
import { LogicNode } from './logic/LogicNode.js';

// Specific Triggers
class GoogleSheetsTriggerNode extends TriggerNode {
    async execute(context) {
        return { ...context, sheetTriggered: true, timestamp: new Date().toISOString() };
    }
}
class WebhookTriggerNode extends TriggerNode {}
class ScheduleTriggerNode extends TriggerNode {}
class FormTriggerNode extends TriggerNode {}

// Specific Actions
class GoogleSheetsActionNode extends ActionNode {
    async execute(context) {
        // Implement Google Sheets create/read/update/delete based on config
        return { ...context, sheetsActionResult: 'success' };
    }
}
class HttpActionNode extends ActionNode {}
class DatabaseActionNode extends ActionNode {}
class SlackActionNode extends ActionNode {}
class TicketActionNode extends ActionNode {}

// Specific AI Nodes
class ExtractIntentNode extends AINode {}
class SummarizeNode extends AINode {}
class GenerateResponseNode extends AINode {}
class CategorizeDataNode extends AINode {}

// Specific Logic Nodes
class ConditionNode extends LogicNode {
    async execute(context) {
        const expression = this.config.expression || 'true';
        let result = false;
        try {
            // Safely evaluate simple expression against context properties
            const keys = Object.keys(context);
            const values = Object.values(context);
            const fn = new Function(...keys, `return Boolean(${expression});`);
            result = fn(...values);
        } catch (err) {
            console.error('Failed to evaluate condition expression:', expression, err);
            result = false;
        }
        return { ...context, logicResult: result, targetHandle: result ? 'true' : 'false' };
    }
}
class SwitchNode extends LogicNode {}
class LoopNode extends LogicNode {}
class DelayNode extends LogicNode {}

export class NodeFactory {
    static createNode(nodeData) {
        const { id, type, subType, config, position } = nodeData;
        
        switch (type) {
            case 'trigger':
                if (subType === 'googleSheets') return new GoogleSheetsTriggerNode(id, subType, config, position);
                if (subType === 'webhook') return new WebhookTriggerNode(id, subType, config, position);
                if (subType === 'schedule') return new ScheduleTriggerNode(id, subType, config, position);
                if (subType === 'form') return new FormTriggerNode(id, subType, config, position);
                return new TriggerNode(id, subType, config, position);
                
            case 'action':
                if (subType === 'googleSheets') return new GoogleSheetsActionNode(id, subType, config, position);
                if (subType === 'http') return new HttpActionNode(id, subType, config, position);
                if (subType === 'database') return new DatabaseActionNode(id, subType, config, position);
                if (subType === 'slack') return new SlackActionNode(id, subType, config, position);
                if (subType === 'ticket') return new TicketActionNode(id, subType, config, position);
                return new ActionNode(id, subType, config, position);
                
            case 'ai':
                if (subType === 'extract') return new ExtractIntentNode(id, subType, config, position);
                if (subType === 'summarize') return new SummarizeNode(id, subType, config, position);
                if (subType === 'generate') return new GenerateResponseNode(id, subType, config, position);
                if (subType === 'categorize') return new CategorizeDataNode(id, subType, config, position);
                return new AINode(id, subType, config, position);
                
            case 'logic':
                if (subType === 'condition') return new ConditionNode(id, subType, config, position);
                if (subType === 'switch') return new SwitchNode(id, subType, config, position);
                if (subType === 'loop') return new LoopNode(id, subType, config, position);
                if (subType === 'delay') return new DelayNode(id, subType, config, position);
                return new LogicNode(id, subType, config, position);
                
            default:
                throw new Error(`Unknown node type: ${type}`);
        }
    }
}
