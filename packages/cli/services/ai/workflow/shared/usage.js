export const addWorkflowUsage = (total = {}, response, stage) => {
    const usage = response?.usageMetadata || {};
    const promptTokens = usage.promptTokens || usage.promptTokenCount || 0;
    const completionTokens = usage.completionTokens || usage.candidatesTokenCount || 0;
    const totalTokens = usage.totalTokens || usage.totalTokenCount || 0;
    const previous = total.stages?.[stage] || {};
    return {
        promptTokens: (total.promptTokens || 0) + promptTokens,
        completionTokens: (total.completionTokens || 0) + completionTokens,
        totalTokens: (total.totalTokens || 0) + totalTokens,
        stages: {
            ...(total.stages || {}),
            [stage]: {
                promptTokens: (previous.promptTokens || 0) + promptTokens,
                completionTokens: (previous.completionTokens || 0) + completionTokens,
                totalTokens: (previous.totalTokens || 0) + totalTokens,
                calls: (previous.calls || 0) + 1
            }
        }
    };
};

