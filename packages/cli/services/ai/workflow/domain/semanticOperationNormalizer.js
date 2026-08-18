import { SEMANTIC_CONTROL_FLOW_NODE_KEYS } from './editCompiler/contracts.js';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const token = value => String(value || '').replace(/[^a-z0-9]+/gi, '').toLowerCase();

const actionCandidates = keys => keys.filter(key => !SEMANTIC_CONTROL_FLOW_NODE_KEYS.has(key));

const resolveActionNodeKey = ({ action, knownNodeKeys }) => {
    if (!isObject(action) || typeof action.nodeKey !== 'string') return action;
    if (knownNodeKeys.includes(action.nodeKey)) return action;

    const prefix = action.nodeKey.split(':')[0];
    const candidates = actionCandidates(knownNodeKeys).filter(key => key.startsWith(`${prefix}:`));
    const wanted = token(action.nodeKey.split(':').slice(1).join(':'));
    const title = token(action.title);
    const matches = candidates.filter(candidate => {
        const candidateToken = token(candidate.split(':').slice(1).join(':'));
        return candidateToken && (
            wanted.includes(candidateToken)
            || candidateToken.includes(wanted)
            || (title && title.includes(candidateToken))
        );
    });
    const resolved = matches.length === 1
        ? matches[0]
        : candidates.length === 1 ? candidates[0] : null;
    return resolved ? { ...action, nodeKey: resolved } : action;
};

const rewriteKnownReferences = ({ value, aliases, ambiguous, issues }) => {
    if (Array.isArray(value)) return value.map(item => rewriteKnownReferences({ value: item, aliases, ambiguous, issues }));
    if (!isObject(value)) return value;
    const rewritten = Object.fromEntries(Object.entries(value).map(([key, nested]) => {
        if (['nodeRef', 'afterNodeRef'].includes(key) && typeof nested === 'string') {
            if (aliases.has(nested)) return [key, aliases.get(nested)];
            if (ambiguous.has(nested)) {
                issues.push({
                    code: 'WORKFLOW_SEMANTIC_REF_AMBIGUOUS',
                    path: key,
                    value: nested,
                    message: 'A generated control-flow step was named more than once, so a later route cannot identify which step to use.'
                });
            }
        }
        return [key, rewriteKnownReferences({ value: nested, aliases, ambiguous, issues })];
    }));
    if (rewritten.$expr === 'reference' && rewritten.v === 1 && typeof rewritten.nodeId === 'string' && aliases.has(rewritten.nodeId)) {
        rewritten.nodeId = aliases.get(rewritten.nodeId);
    }
    return rewritten;
};

const rewriteExpressionNodeRefs = ({ value, aliases }) => {
    if (Array.isArray(value)) return value.map(item => rewriteExpressionNodeRefs({ value: item, aliases }));
    if (!isObject(value)) return value;
    if (value.$expr === 'reference' && value.v === 1 && typeof value.nodeId === 'string' && aliases.has(value.nodeId)) {
        return {
            ...value,
            nodeId: aliases.get(value.nodeId)
        };
    }
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
        key,
        rewriteExpressionNodeRefs({ value: nested, aliases })
    ]));
};

const definitionRef = (definition, generatedRef, aliases, ambiguous) => {
    if (!isObject(definition)) return definition;
    const original = typeof definition.ref === 'string' && definition.ref.trim() ? definition.ref.trim() : null;
    if (original) {
        if (aliases.has(original) && aliases.get(original) !== generatedRef) {
            aliases.delete(original);
            ambiguous.add(original);
        } else if (!ambiguous.has(original)) {
            aliases.set(original, generatedRef);
        }
    }
    return { ...definition, ref: generatedRef };
};

const actionDefinition = ({ definition, generatedRef, aliases, ambiguous, knownNodeKeys }) => {
    const withRef = definitionRef(definition, generatedRef, aliases, ambiguous);
    return resolveActionNodeKey({ action: withRef, knownNodeKeys });
};

const isEmptyOptionalAction = value => value === null || (isObject(value) && Object.keys(value).length === 0);

const normalizeOperation = ({ operation, index, aliases, ambiguous, knownNodeKeys }) => {
    const prefix = `cf_${index + 1}`;
    switch (operation?.op) {
    case 'add_condition_branch':
        return {
            ...operation,
            condition: definitionRef(operation.condition, `${prefix}_condition`, aliases, ambiguous),
            whenTrue: actionDefinition({ definition: operation.whenTrue, generatedRef: `${prefix}_true`, aliases, ambiguous, knownNodeKeys }),
            whenFalse: actionDefinition({ definition: operation.whenFalse, generatedRef: `${prefix}_false`, aliases, ambiguous, knownNodeKeys })
        };
    case 'add_switch_routes':
        return {
            ...operation,
            switch: definitionRef(operation.switch, `${prefix}_switch`, aliases, ambiguous),
            cases: Array.isArray(operation.cases) ? operation.cases.map((routeCase, caseIndex) => ({
                ...routeCase,
                action: actionDefinition({ definition: routeCase?.action, generatedRef: `${prefix}_case_${caseIndex + 1}`, aliases, ambiguous, knownNodeKeys })
            })) : operation.cases,
            otherwise: actionDefinition({ definition: operation.otherwise, generatedRef: `${prefix}_otherwise`, aliases, ambiguous, knownNodeKeys })
        };
    case 'add_error_handler':
        return {
            ...operation,
            handler: definitionRef(operation.handler, `${prefix}_error_handler`, aliases, ambiguous),
            whenError: actionDefinition({ definition: operation.whenError, generatedRef: `${prefix}_error`, aliases, ambiguous, knownNodeKeys })
        };
    case 'add_approval_gate':
        return {
            ...operation,
            approval: definitionRef(operation.approval, `${prefix}_approval`, aliases, ambiguous),
            ...(operation.whenApproved === undefined ? {} : {
                whenApproved: actionDefinition({ definition: operation.whenApproved, generatedRef: `${prefix}_approved`, aliases, ambiguous, knownNodeKeys })
            }),
            ...(operation.whenRejected === undefined || isEmptyOptionalAction(operation.whenRejected) ? {} : {
                whenRejected: actionDefinition({ definition: operation.whenRejected, generatedRef: `${prefix}_rejected`, aliases, ambiguous, knownNodeKeys })
            }),
            ...(operation.whenRejected === null ? { whenRejected: null } : {})
        };
    case 'add_terminal_approval':
        return {
            ...operation,
            approval: definitionRef(operation.approval, `${prefix}_approval`, aliases, ambiguous)
        };
    case 'join_branches':
        return {
            ...operation,
            merge: definitionRef(operation.merge, `${prefix}_merge`, aliases, ambiguous),
            continueWith: actionDefinition({ definition: operation.continueWith, generatedRef: `${prefix}_continue`, aliases, ambiguous, knownNodeKeys })
        };
    default:
        return operation;
    }
};

/**
 * The AI may name existing graph nodes, but it never owns names for newly
 * created control-flow nodes. This keeps every semantic graph edit collision
 * free and lets the compiler safely resolve later branch joins.
 */
export const normalizeSemanticWorkflowOperations = ({ operations = [], knownNodeKeys = [] } = {}) => {
    const aliases = new Map();
    const ambiguous = new Set();
    const issues = [];
    const normalized = (operations || []).map((original, index) => {
        const operation = rewriteKnownReferences({ value: clone(original), aliases, ambiguous, issues });
        const normalizedOperation = normalizeOperation({ operation, index, aliases, ambiguous, knownNodeKeys });
        // A semantic operation may assign a compiler-owned ref to a branch
        // action after reading its config. Resolve expressions in that same
        // operation after the alias exists without rewriting its source
        // nodeRef, which may intentionally point at the pre-existing route.
        return rewriteExpressionNodeRefs({ value: normalizedOperation, aliases });
    });
    return { operations: normalized, issues };
};
