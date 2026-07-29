import {
    buildVerifierContext
} from '../context/formContext.js';
import { validateVerifierResult } from '../domain/formSchemaValidator.js';
import { verifierInstruction } from '../shared/instructions.js';
import { createAIOutputError } from '../shared/errors.js';
import { getOutputIssues, requestJson } from '../provider/request.js';
import { repairVerifier } from './repairs.js';
import { addTokenUsage } from '../shared/usage.js';
import { MAX_VERIFIER_ATTEMPTS } from '../shared/constants.js';

const verifyProposal = async ({ provider, requirements, patches, memoryUpdate, tokenUsage, budget, cardinality, onActivity = null }) => {
    const verification = await requestJson({
        provider,
        contents: [{ role: 'user', parts: [{ text: buildVerifierContext({ requirements, patches, memoryUpdate, cardinality }) }] }],
        systemInstruction: verifierInstruction,
        label: 'verifier',
        budget,
        onActivity
    });
    return {
        ...verification,
        tokenUsage: addTokenUsage(tokenUsage, verification.response, 'verifier')
    };
};

export const verifyProposalWithRecovery = async ({
    provider,
    requirements,
    patches,
    memoryUpdate,
    cardinality,
    tokenUsage,
    onProgress,
    onActivity = null,
    budget
}) => {
    let verifierCall;
    let verificationIssues;
    let totalTokenUsage = tokenUsage;

    for (let attempt = 0; attempt < MAX_VERIFIER_ATTEMPTS; attempt += 1) {
        if (attempt === 0) {
            verifierCall = await verifyProposal({
                provider,
                requirements,
                patches,
                memoryUpdate,
                cardinality,
                tokenUsage: totalTokenUsage,
                budget,
                onActivity
            });
        } else {
            if (onProgress) onProgress({ status: 'repairing', message: 'Correcting the verification response...' });
            verifierCall = await repairVerifier({
                provider,
                requirements,
                patches,
                memoryUpdate,
                cardinality,
                rawText: verifierCall.rawText,
                issues: verificationIssues,
                tokenUsage: totalTokenUsage,
                budget,
                onActivity
            });
        }

        totalTokenUsage = verifierCall.tokenUsage;
        verificationIssues = getOutputIssues({ ...verifierCall, validate: validateVerifierResult });
        if (verificationIssues.length === 0) {
            const verification = verifierCall.value;
            return {
                ...verifierCall,
                value: {
                    ...verification,
                    fulfilledRequirements: verification.status === 'pass'
                        ? requirements.map(requirement => requirement.id)
                        : []
                },
                tokenUsage: totalTokenUsage
            };
        }
    }

    throw createAIOutputError(
        'I could not verify the form proposal safely after retrying the verification response. No changes were applied.',
        'FORM_AI_VERIFICATION_FAILED',
        verificationIssues
    );
};
