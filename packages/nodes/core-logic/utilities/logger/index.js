import { LogicNode } from '../../../BaseNode.js';

export default class LoggerNode extends LogicNode {
    /**
     * Executes the node's core logic.
     * @param {Object} context - The current execution context, containing results from previous nodes.
     * @returns {Object} - Returns the updated context and any specific output data.
     */
    async execute(context) {
        // 1. Resolve configuration dynamically against context to support variables
        const resolvedConfig = this.getResolvedConfig(context);
        const message = resolvedConfig.logMessage || "No message provided";
        const level = resolvedConfig.logLevel || "info";
        const includeContext = resolvedConfig.includeContext === true || resolvedConfig.includeContext === "true";

        // 2. Perform the node's specific action (in this case, logging)
        const logPrefix = `[Workflow Logger - ${level.toUpperCase()}] Node ID: ${this.id}`;
        
        if (level === 'error') {
            console.error(logPrefix, message);
        } else if (level === 'warn') {
            console.warn(logPrefix, message);
        } else {
            console.log(logPrefix, message);
        }

        if (includeContext) {
            console.log(`${logPrefix} Context Dump:`, JSON.stringify(context, null, 2));
        }

        // 3. Return the result. We merge the existing context and append our output.
        // Our schema.json outputs say we return a 'loggedAt' string.
        return { 
            ...context, 
            success: true,
            loggedAt: new Date().toISOString()
        };
    }
}
