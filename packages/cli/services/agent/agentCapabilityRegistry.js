/**
 * Capability registry for the agent runtime.
 *
 * A capability is the only place that knows how to execute one kind of
 * action. The runtime only needs the small interface exposed here, which
 * keeps routing and execution policy independent from forms, workflows, and
 * future domains.
 */

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

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
