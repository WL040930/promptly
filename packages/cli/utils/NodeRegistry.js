import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

class NodeRegistry {
    constructor() {
        this.nodesBySubType = new Map();
        this.uiLibrary = []; // Array of categories for the UI
    }

    async init() {

        // The cli process runs in packages/cli, so go up one level to packages/nodes
        const nodesDir = path.resolve(process.cwd(), '..', 'nodes');
        
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
                const { data: metadata } = matter(mdContent);

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
                let configSchema = { inputs: [], outputs: [] };
                try {
                    const schemaContent = await fs.readFile(path.join(dir, 'schema.json'), 'utf-8');
                    configSchema = JSON.parse(schemaContent);
                } catch (err) {
                    // Ignore if schema.json doesn't exist
                }

                // 4. Register the node
                const key = `${metadata.type}:${metadata.subType}`;
                this.nodesBySubType.set(key, { NodeClass, metadata, configSchema });

                // 5. Build UI Library hierarchy
                if (!categoryMap.has(category)) {
                    categoryMap.set(category, new Map());
                }
                const groupMap = categoryMap.get(category);
                if (!groupMap.has(group)) {
                    groupMap.set(group, []);
                }
                
                // Construct the UI item
                const uiItem = {
                    title: metadata.title,
                    type: metadata.type,
                    subType: metadata.subType,
                    description: metadata.description,
                    schema: configSchema,
                    ...metadata.ui
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

        console.log(`[NodeRegistry] Successfully registered ${this.nodesBySubType.size} dynamic nodes.`);
    }

    getClass(type, subType) {
        const entry = this.nodesBySubType.get(`${type}:${subType}`);
        return entry ? entry.NodeClass : null;
    }

    getUiLibrary() {
        return this.uiLibrary;
    }
}

// Export a singleton
const registry = new NodeRegistry();
export default registry;
