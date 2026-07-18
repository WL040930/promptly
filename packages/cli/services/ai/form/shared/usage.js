export const addTokenUsage = (total = {}, response, stage = null) => {
    const usage = response?.usageMetadata;
    const promptTokens = usage?.promptTokens ?? usage?.promptTokenCount ?? 0;
    const completionTokens = usage?.completionTokens ?? usage?.candidatesTokenCount ?? 0;
    const totalTokens = usage?.totalTokens ?? usage?.totalTokenCount ?? 0;
    const nextTotal = {
        promptTokens: (total.promptTokens || 0) + promptTokens,
        completionTokens: (total.completionTokens || 0) + completionTokens,
        totalTokens: (total.totalTokens || 0) + totalTokens,
        ...(total.stages ? { stages: { ...total.stages } } : {})
    };

    if (stage) {
        const previousStage = total.stages?.[stage] || {};
        nextTotal.stages = {
            ...(nextTotal.stages || {}),
            [stage]: {
                promptTokens: (previousStage.promptTokens || 0) + promptTokens,
                completionTokens: (previousStage.completionTokens || 0) + completionTokens,
                totalTokens: (previousStage.totalTokens || 0) + totalTokens,
                calls: (previousStage.calls || 0) + 1
            }
        };
    }

    return nextTotal;
};
