import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { validateNodeDefinition } from './nodeDefinitionValidator.js';

const nodeKeyFor = (type, subType) => `${type}:${subType}`;
const unavailableForNewWorkflows = new Set(['disabled', 'coming_soon', 'retired', 'hidden']);

const compactInput = input => {
    if (!input || input.isConnection) return null;
    return {
        name: input.name,
        label: input.label || input.name,
        type: input.type,
        required: input.required === true,
        ...(input.defaultValue !== undefined ? { defaultValue: input.defaultValue } : {}),
        ...(input.resource ? { resource: input.resource } : {}),
        ...(input.resourceParams ? { resourceParams: input.resourceParams } : {}),
        ...(input.requiredResourceParams ? { requiredResourceParams: input.requiredResourceParams } : {}),
        ...(input.showWhen ? { showWhen: input.showWhen } : {}),
        ...(input.requiredWhen ? { requiredWhen: input.requiredWhen } : {}),
        ...(Array.isArray(input.options) ? { options: input.options.slice(0, 20) } : {}),
        ...(input.optionsBy ? { optionsBy: input.optionsBy } : {})
    };
};

const compactConnections = (items = []) => items
    .filter(item => item?.isConnection)
    .map(item => ({
        name: item.name,
        label: item.label || item.name,
        type: item.type || 'object',
        description: item.description || ''
    }));

const implementationStatusFor = (NodeClass, metadata = {}) => {
    if (typeof metadata.implementationStatus === 'string' && metadata.implementationStatus.trim()) {
        return metadata.implementationStatus.trim().toLowerCase();
    }
    const source = NodeClass?.prototype?.execute?.toString?.() || '';
    const isPlaceholder = [
        'Core execution logic goes here',
        'Actual LLM call would go here',
        'return { ...context, success: true }'
    ].some(marker => source.includes(marker));

    return isPlaceholder ? 'coming_soon' : 'experimental';
};

class NodeRegistry {
    constructor() {
        this.nodesByNodeKey = new Map();
        this.uiLibrary = []; // Array of categories for the UI
    }

    async init({ nodesDir = path.resolve(process.cwd(), '..', 'nodes') } = {}) {

        this.nodesByNodeKey.clear();

        // Helper to recursively find all NODE.md files
        const findNodeDirs = async (dir) => {
            let results = [];
            const list = await fs.readdir(dir, { withFileTypes: true });
            for (const dirent of list) {
                const fullPath = path.join(dir, dirent.name);
                if (dirent.isDirectory()) {
                    results = results.concat(await findNodeDirs(fullPath));
                } else if (dirent.isFile() && dirent.name === 'NODE.md') {
                    results.push(dir); // The directory containing the node
                }
            }
            return results;
        };

        const nodeDirs = await findNodeDirs(nodesDir);

        // Map to group nodes by category -> group
        const categoryMap = new Map(); // Map<categoryName, Map<groupName, Array<nodeMetadata>>>

        for (const dir of nodeDirs) {
            try {
                // 1. Read metadata from NODE.md
                const mdContent = await fs.readFile(path.join(dir, 'NODE.md'), 'utf-8');
                const { data: metadata, content: instructionBody } = matter(mdContent);

                // 2. Parse category and group from directory path
                // Expected path: packages/nodes/<category>/<group>/<node-name>
                const relativePath = path.relative(nodesDir, dir);
                const pathParts = relativePath.split(path.sep);
                
                if (pathParts.length < 3) {
                    console.warn(`Skipping ${dir}: Path must be at least 3 levels deep (category/group/name)`);
                    continue;
                }

                // Format folder names for UI (e.g., 'core-logic' -> 'Core Logic', 'system-triggers' -> 'System Triggers')
                const formatName = (str) => str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                
                const category = formatName(pathParts[0]);
                const group = formatName(pathParts[1]);

                // 3. Dynamically import the execution class
                const indexPath = path.join(dir, 'index.js');
                
                let NodeClass;
                try {
                    // Convert to file:// URL for dynamic import on Windows
                    const importUrl = `file://${indexPath.replace(/\\/g, '/')}`;
                    const module = await import(importUrl);
                    NodeClass = module.default;
                    if (!NodeClass) {
                         console.warn(`Skipping ${dir}: No default export found in index.js`);
                         continue;
                    }
                } catch (importErr) {
                    console.warn(`Skipping ${dir}: Failed to import index.js`, importErr);
                    continue; // Skip if we can't import the execution logic
                }

                // Read optional schema.json
                const schemaContent = await fs.readFile(path.join(dir, 'schema.json'), 'utf-8');
                const configSchema = JSON.parse(schemaContent);

                // 4. Register the node
                const nodeKey = nodeKeyFor(metadata.type, metadata.subType);
                if (this.nodesByNodeKey.has(nodeKey)) {
                    throw new Error(`Duplicate node key "${nodeKey}".`);
                }
                const entry = {
                    nodeKey,
                    NodeClass,
                    metadata,
                    configSchema,
                    instructionBody: instructionBody.trim(),
                    implementationStatus: implementationStatusFor(NodeClass, metadata)
                };
                const definitionIssues = validateNodeDefinition(entry);
                if (definitionIssues.length > 0) {
                    const error = new Error(`Invalid node definition for ${nodeKey}.`);
                    error.issues = definitionIssues;
                    throw error;
                }
                this.nodesByNodeKey.set(nodeKey, entry);

                // 5. Build UI Library hierarchy
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, new Map());
                }
                const groupMap = categoryMap.get(category);
                if (!groupMap.has(group)) {
                    groupMap.set(group, []);
                }
                
                // Construct the UI item
                const ui = metadata.ui || {};
                const uiItem = {
                    title: metadata.title,
                    type: metadata.type,
                    subType: metadata.subType,
                    nodeKey,
                    implementationStatus: entry.implementationStatus,
                    description: metadata.description,
                    schema: configSchema,
                    icon: ui.icon,
                    bgColor: ui.bgColor || ui.iconBg,
                    color: ui.color || ui.iconColor,
                    iconColor: ui.iconColor || ui.color
                };
                
                groupMap.get(group).push(uiItem);
                
            } catch (err) {
                console.error(`Error processing node at ${dir}:`, err);
            }
        }

        // Convert the Maps into the final Array structure expected by the frontend
        this.uiLibrary = Array.from(categoryMap.entries()).map(([categoryName, groupMap]) => {
            return {
                category: categoryName,
                groups: Array.from(groupMap.entries()).map(([groupName, items]) => {
                    return {
                        name: groupName,
                        items: items
                    };
                })
            };
        });

        console.log(`[NodeRegistry] Successfully registered ${this.nodesByNodeKey.size} dynamic nodes.`);
    }

    getClass(type, subType) {
        const entry = this.nodesByNodeKey.get(nodeKeyFor(type, subType));
        return entry ? entry.NodeClass : null;
    }

    getDefinition(type, subType) {
        return this.nodesByNodeKey.get(nodeKeyFor(type, subType)) || null;
    }

    getDefinitionByNodeKey(nodeKey) {
        return this.nodesByNodeKey.get(nodeKey) || null;
    }

    getUiLibrary() {
        return this.uiLibrary;
    }

    /**
     * Return the small amount of information needed to classify an agent
     * request. It includes compact field and connection summaries, while
     * keeping full schemas and instruction bodies out of the first model call.
     */
    getCompactCatalogue() {
        return Array.from(this.nodesByNodeKey.values())
            // Hidden nodes stay registered so existing saved workflows can still
            // resolve them, but they must not be proposed for new workflows.
            .filter(entry => !unavailableForNewWorkflows.has(entry.implementationStatus))
            .map(entry => ({
            nodeKey: entry.nodeKey,
            subType: entry.metadata.subType,
            type: entry.metadata.type,
            title: entry.metadata.title,
            description: entry.metadata.description || '',
            implementationStatus: entry.implementationStatus,
            inputs: (entry.configSchema?.inputs || []).map(compactInput).filter(Boolean),
            outputs: compactConnections(entry.configSchema?.outputs || [])
            }));
    }

    /**
     * Resolve full node contracts by canonical node key.
     */
    getSchemasFor(nodeKeys = []) {
        return [...new Set(nodeKeys)]
            .map(reference => this.nodesByNodeKey.get(reference))
            .filter(Boolean)
            .map(entry => {
                return {
                    nodeKey: entry.nodeKey,
                    subType: entry.metadata.subType,
                    type: entry.metadata.type,
                    title: entry.metadata.title,
                    description: entry.metadata.description || '',
                    schema: entry.configSchema || { inputs: [], outputs: [] },
                    instruction: entry.instructionBody || '',
                    ui: entry.metadata.ui || {},
                    implementationStatus: entry.implementationStatus
                };
            })
            .filter(spec => !['disabled', 'coming_soon', 'retired'].includes(spec.implementationStatus))
            .filter(Boolean);
    }
}

// Export a singleton
const registry = new NodeRegistry();
export default registry;
