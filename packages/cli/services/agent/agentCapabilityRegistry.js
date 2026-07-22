/**
 * Capability registry for the agent runtime.
 *
 * A capability is the only place that knows how to execute one kind of
 * action. The runtime only needs the small interface exposed here, which
 * keeps routing and execution policy independent from forms, workflows, and
 * future domains.
 */

import Ajv from 'ajv';

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ajv = new Ajv({ allErrors: true, strict: false });
const outputValidators = new WeakMap();

const normalizeDefinition = definition => {
    if (!isPlainObject(definition)) throw new TypeError('Capability definition must be an object.');
    const name = String(definition.name || '').trim();
    if (!name) throw new TypeError('Capability name is required.');
    if (typeof definition.execute !== 'function') {
        throw new TypeError(`Capability '${name}' must provide an execute function.`);
    }

    return Object.freeze({
        name,
        description: String(definition.description || '').trim(),
        risk: ['read', 'proposal', 'write'].includes(definition.risk) ? definition.risk : 'proposal',
        inputSchema: definition.inputSchema || {
            type: 'object',
            properties: {},
            additionalProperties: false
        },
        outputSchema: definition.outputSchema || null,
        produces: Array.isArray(definition.produces) ? definition.produces.map(String).slice(0, 12) : [],
        execute: definition.execute
    });
};

class AgentCapabilityRegistry {
    #capabilities = new Map();

    constructor(definitions = []) {
        if (!Array.isArray(definitions)) throw new TypeError('Capability definitions must be an array.');
        definitions.forEach(definition => this.register(definition));
    }

    register(definition) {
        const normalized = normalizeDefinition(definition);
        if (this.#capabilities.has(normalized.name)) {
            throw new Error(`Capability '${normalized.name}' is already registered.`);
        }
        this.#capabilities.set(normalized.name, normalized);
        return this;
    }

    has(name) {
        return this.#capabilities.has(String(name || '').trim());
    }

    get(name) {
        return this.#capabilities.get(String(name || '').trim()) || null;
    }

    list() {
        return [...this.#capabilities.values()];
    }

    toToolDefinitions() {
        return this.list().map(capability => ({
            type: 'function',
            function: {
                name: capability.name,
                description: capability.description,
                strict: true,
                parameters: capability.inputSchema
            }
        }));
    }

    validateOutput(name, output) {
        const capability = this.get(name);
        if (!capability?.outputSchema) return [];
        let validate = outputValidators.get(capability.outputSchema);
        try {
            if (!validate) {
                validate = ajv.compile(capability.outputSchema);
                outputValidators.set(capability.outputSchema, validate);
            }
        } catch (error) {
            return [{ code: 'CAPABILITY_OUTPUT_SCHEMA_INVALID', message: error.message }];
        }
        if (validate(output)) return [];
        return (validate.errors || []).map(error => ({
            code: 'CAPABILITY_OUTPUT_INVALID',
            path: error.instancePath || '',
            message: error.message || 'Capability output is invalid.'
        }));
    }

    async execute(name, args = {}, context = {}) {
        const capability = this.get(name);
        if (!capability) {
            const error = new Error(`Unknown agent capability '${name}'.`);
            error.code = 'AGENT_UNKNOWN_CAPABILITY';
            throw error;
        }
        return capability.execute({ args, context, capability });
    }
}

export const createAgentCapabilityRegistry = definitions => new AgentCapabilityRegistry(definitions);
