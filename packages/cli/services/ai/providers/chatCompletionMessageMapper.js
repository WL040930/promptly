const textFromParts = (parts) => Array.isArray(parts)
    ? parts.map(part => part?.text || '').join('\n')
    : parts || '';

export const toChatCompletionMessages = (contents, systemInstruction) => {
    const messages = [];
    if (systemInstruction) messages.push({ role: 'system', content: systemInstruction });

    for (const content of contents || []) {
        if (typeof content === 'string') {
            messages.push({ role: 'user', content });
            continue;
        }

        if (content.role === 'tool') {
            messages.push({
                role: 'tool',
                tool_call_id: content.toolCallId,
                ...(content.name ? { name: content.name } : {}),
                content: content.content ?? textFromParts(content.parts)
            });
            continue;
        }

        const role = content.role === 'model' ? 'assistant' : content.role || 'user';
        const message = {
            role,
            content: textFromParts(content.parts) || null
        };
        if (Array.isArray(content.toolCalls) && content.toolCalls.length > 0) {
            message.tool_calls = content.toolCalls.map(call => ({
                id: call.id,
                type: 'function',
                function: {
                    name: call.name,
                    arguments: typeof call.args === 'string' ? call.args : JSON.stringify(call.args || {})
                }
            }));
        }
        messages.push(message);
    }

    return messages;
};

export const applyToolOptions = (body, options = {}) => {
    if (!Array.isArray(options.tools) || options.tools.length === 0) return;
    body.tools = options.tools;
    body.tool_choice = options.toolChoice || 'auto';
    body.parallel_tool_calls = false;
};

export const normalizeToolCalls = (message) => (message?.tool_calls || [])
    .map(call => {
        const rawArguments = call.function?.arguments || '{}';
        let args = {};
        try {
            args = JSON.parse(rawArguments);
        } catch {
            args = { _invalidArguments: rawArguments };
        }
        return {
            id: call.id,
            name: call.function?.name,
            args
        };
    })
    .filter(call => call.id && call.name);
