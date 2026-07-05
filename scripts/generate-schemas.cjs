const fs = require('fs');
const path = require('path');

const NODES_DIR = path.join(__dirname, '../packages/nodes');

function getGenericSchema(nodeName, folderType) {
    if (folderType === 'triggers') {
        return {
            inputs: [
                {
                    name: "eventName",
                    type: "text",
                    label: "Event Name to listen to",
                    defaultValue: "onCreated",
                }
            ],
            outputs: [
                {
                    name: "triggerData",
                    type: "object",
                    label: "Trigger Data",
                    isConnection: true,
                    description: "Data received from the trigger event."
                }
            ]
        };
    } else if (folderType === 'ai-natural-language') {
        return {
            inputs: [
                {
                    name: "inputData",
                    type: "object",
                    label: "Input Data",
                    isConnection: true
                },
                {
                    name: "prompt",
                    type: "textarea",
                    label: "Prompt Template",
                    defaultValue: "Process this data: {{variables}}"
                },
                {
                    name: "model",
                    type: "select",
                    label: "AI Model",
                    defaultValue: "gpt-4o",
                    options: [
                        { label: "GPT-4o", value: "gpt-4o" },
                        { label: "Claude 3.5 Sonnet", value: "claude-3-5" },
                        { label: "Gemini 1.5 Pro", value: "gemini-1-5" }
                    ]
                }
            ],
            outputs: [
                {
                    name: "result",
                    type: "string",
                    label: "Output Result",
                    isConnection: true,
                    description: "The AI generated text/data."
                }
            ]
        };
    } else if (folderType === 'integrations') {
        return {
            inputs: [
                {
                    name: "triggerData",
                    type: "object",
                    label: "Input Payload",
                    isConnection: true
                },
                {
                    name: "actionUrl",
                    type: "text",
                    label: "Target URL/Resource",
                    placeholder: "https://api.example.com"
                }
            ],
            outputs: [
                {
                    name: "response",
                    type: "object",
                    label: "API Response",
                    isConnection: true
                }
            ]
        };
    } else {
        // Core Logic or fallback
        return {
            inputs: [
                {
                    name: "input1",
                    type: "object",
                    label: "Input Data",
                    isConnection: true
                },
                {
                    name: "setting",
                    type: "text",
                    label: "Configuration Setting",
                    defaultValue: ""
                }
            ],
            outputs: [
                {
                    name: "outputData",
                    type: "object",
                    label: "Output Data",
                    isConnection: true
                }
            ]
        };
    }
}

function getIndexTemplate(className, depth) {
    let requirePath = '../'.repeat(depth) + 'BaseNode';
    return "const BaseNode = require('" + requirePath + "');\n\n" +
           "class " + className + " extends BaseNode {\n" +
           "    async execute(context) {\n" +
           "        console.log('[' + this.constructor.name + '] Executing...');\n" +
           "        return {\n" +
           "            status: 'success',\n" +
           "            data: {\n" +
           "                message: 'Executed ' + this.constructor.name\n" +
           "            }\n" +
           "        };\n" +
           "    }\n" +
           "}\n\n" +
           "module.exports = " + className + ";\n";
}

function processDirectory(dir, depth = 0) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
            processDirectory(fullPath, depth + 1);
        } else if (entry.name === 'NODE.md') {
            // Found a node directory!
            const nodeDir = dir;
            const nodeName = path.basename(nodeDir);
            
            // Determine folder type by checking path
            let folderType = 'core-logic';
            if (nodeDir.includes('/triggers/')) folderType = 'triggers';
            if (nodeDir.includes('/ai-natural-language/')) folderType = 'ai-natural-language';
            if (nodeDir.includes('/integrations/')) folderType = 'integrations';
            
            const schemaPath = path.join(nodeDir, 'schema.json');
            const indexPath = path.join(nodeDir, 'index.js');
            
            if (!fs.existsSync(schemaPath)) {
                const schema = getGenericSchema(nodeName, folderType);
                fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2), 'utf-8');
                console.log('Created schema.json for ' + nodeName);
            }
            
            if (!fs.existsSync(indexPath)) {
                // Generate a class name like "ImageGenerationNode"
                const className = nodeName.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('') + 'Node';
                fs.writeFileSync(indexPath, getIndexTemplate(className, depth), 'utf-8');
                console.log('Created index.js for ' + nodeName);
            }
        }
    }
}

processDirectory(NODES_DIR);
console.log('Done!');
