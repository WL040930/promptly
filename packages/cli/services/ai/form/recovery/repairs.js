import {
    buildPlannerRepairContext,
    buildVerifierRepairContext,
    buildWorkerRepairContext
} from '../context/formContext.js';
import { summarizeValidationIssues } from '../domain/formSchemaValidator.js';
import { plannerInstruction, verifierInstruction, workerInstruction } from '../shared/instructions.js';
import { requestJson } from '../provider/request.js';
import { addTokenUsage } from '../shared/usage.js';

export const repairPlanner = async ({ provider, rawText, issues, tokenUsage, budget, cardinality, onActivity = null }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildPlannerRepairContext({
            response: rawText,
            issues: summarizeValidationIssues(issues),
            cardinality
        }) }] }],
        systemInstruction: plannerInstruction,
        label: 'planner repair',
        budget,
        onActivity
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'planner repair')
    };
};

export const repairWorker = async ({ provider, schema, requirements, rawText, issues, tokenUsage, budget, cardinality, turnContext = null, onActivity = null }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildWorkerRepairContext({
            schema,
            requirements,
            response: rawText,
            issues: summarizeValidationIssues(issues),
            cardinality,
            turnContext
        }) }] }],
        systemInstruction: workerInstruction,
        label: 'worker repair',
        budget,
        onActivity
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'worker repair')
    };
};

export const repairVerifier = async ({ provider, requirements, patches, memoryUpdate, rawText, issues, tokenUsage, budget, cardinality, onActivity = null }) => {
    const repaired = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildVerifierRepairContext({
            requirements,
            patches,
            memoryUpdate,
            cardinality,
            response: rawText,
            issues: summarizeValidationIssues(issues)
        }) }] }],
        systemInstruction: verifierInstruction,
        label: 'verifier repair',
        budget,
        onActivity
    });
    return {
        ...repaired,
        tokenUsage: addTokenUsage(tokenUsage, repaired.response, 'verifier repair')
    };
};
