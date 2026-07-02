import Workflow from '../../models/Workflow.js';
import ExecutionLog from '../../models/ExecutionLog.js';
import { executeNodePrompt } from '../ai/aiService.js';

export const executeWorkflow = async (workflowId, userId, triggerPayload = {}) => {
    const startTime = Date.now();
    let status = 'Success';
    let errorMsg = null;
    let stepLogs = [];

    try {
        const workflow = await Workflow.findOne({ where: { id: workflowId, userId } });
        
        if (!workflow) {
            throw new Error('Workflow not found');
        }

        const nodes = workflow.nodes || [];
        
        if (nodes.length === 0) {
            throw new Error('Workflow has no nodes to execute');
        }

        // Extremely simple sequential execution for phase 1.
        // Assuming nodes are executed in the order they appear in the array.
        
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const stepStartTime = Date.now();
            let stepStatus = 'success';
            let stepDetails = '';
            let stepError = null;

            try {
                if (node.type === 'trigger') {
                    stepDetails = `Triggered by ${node.title}. Payload: ${JSON.stringify(triggerPayload)}`;
                } else if (node.type === 'ai') {
                    // Execute AI Prompt
                    const prompt = `Node context: ${node.title} - ${node.description}\nPayload: ${JSON.stringify(triggerPayload)}`;
                    const responseText = await executeNodePrompt(prompt, 'Execute workflow node instructions.');
                    stepDetails = `AI Response: ${responseText.substring(0, 100)}...`;
                } else if (node.type === 'action') {
                    // Simulate Action execution (e.g. Postgres insert, Slack send, SMTP send)
                    stepDetails = `Executed action: ${node.title}. Configured for: ${node.description}`;
                }
            } catch (err) {
                stepStatus = 'failed';
                stepDetails = `Execution failed: ${err.message}`;
                stepError = err.message;
                throw err; // Break execution loop
            } finally {
                const stepDuration = Date.now() - stepStartTime;
                stepLogs.push({
                    name: node.title,
                    type: node.type,
                    status: stepStatus,
                    time: `${stepDuration}ms`,
                    details: stepDetails
                });
            }
        }

    } catch (err) {
        status = 'Failed';
        errorMsg = err.message;
    }

    const durationMs = Date.now() - startTime;

    // Create Execution Log
    const log = await ExecutionLog.create({
        workflowId,
        userId,
        durationMs,
        status,
        trigger: 'Manual Test Run', // or dynamic based on trigger node
        tags: ['Engine', status],
        error: errorMsg,
        steps: stepLogs
    });

    return log;
};
