import { Form, Workflow } from '../../models/index.js';
import { normalizeClarificationMode } from '../../../shared/agentContract.js';

const RESOURCE_CONFIG = {
    workflow: { model: Workflow, labelField: 'name' },
    form: { model: Form, labelField: 'title' }
};

const normalize = (value) => String(value || '').trim().toLocaleLowerCase();

const searchableWords = (value) => normalize(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);

const scoreResource = (resource, reference, labelField) => {
    const query = normalize(reference);
    if (!query) return 0;

    const id = normalize(resource.id);
    const label = normalize(resource[labelField]);
    if (id === query) return 1000;
    if (label === query) return 900;
    if (label.startsWith(query)) return 700;
    if (label.includes(query)) return 500;

    const queryWords = searchableWords(query);
    const labelWords = searchableWords(label);
    const matchedWords = queryWords.filter(word => labelWords.includes(word)).length;
    return matchedWords > 0 ? 100 + matchedWords : 0;
};

const summarizeResource = (resource, type) => {
    const labelField = RESOURCE_CONFIG[type]?.labelField;
    return {
        id: resource.id,
        name: resource[labelField],
        updatedAt: resource.updatedAt
    };
};

export const findResourceCandidates = async ({
    userId,
    type,
    reference = '',
    limit = 50,
    models = { Form, Workflow }
}) => {
    const config = RESOURCE_CONFIG[type];
    if (!config) throw new Error(`Unsupported resource type: ${type}`);

    const model = models[type === 'workflow' ? 'Workflow' : 'Form'] || config.model;
    const resources = await model.findAll({
        where: { userId },
        attributes: ['id', config.labelField, 'updatedAt'],
        order: [['updatedAt', 'DESC']],
        limit
    });

    return resources
        .map(resource => resource.toJSON ? resource.toJSON() : resource)
        .map(resource => ({ resource, score: scoreResource(resource, reference, config.labelField) }))
        .filter(({ score }) => !reference || score > 0)
        .sort((left, right) => right.score - left.score)
        .map(({ resource }) => summarizeResource(resource, type));
};

export const resolveResource = async ({
    userId,
    type,
    reference,
    selectedId = null,
    models = { Form, Workflow }
}) => {
    const config = RESOURCE_CONFIG[type];
    if (!config) throw new Error(`Unsupported resource type: ${type}`);

    if (selectedId) {
        const model = models[type === 'workflow' ? 'Workflow' : 'Form'] || config.model;
        const selected = await model.findOne({ where: { id: selectedId, userId } });
        if (selected) return { status: 'resolved', resource: selected, source: 'selected' };
    }

    const candidates = await findResourceCandidates({ userId, type, reference, models });
    if (candidates.length === 1) return { status: 'resolved', resource: candidates[0], source: 'reference' };

    const query = normalize(reference);
    const exact = candidates.filter(candidate =>
        normalize(candidate.id) === query || normalize(candidate.name) === query
    );
    if (exact.length === 1) return { status: 'resolved', resource: exact[0], source: 'exact_reference' };
    if (candidates.length > 1) return { status: 'ambiguous', candidates };
    return { status: 'not_found', candidates: [] };
};

export const mergeAgentContext = (stored = {}, incoming = {}) => {
    const merged = { ...stored };
    if (Object.prototype.hasOwnProperty.call(incoming, 'workflowId')) {
        merged.workflowId = incoming.workflowId || null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'formId')) {
        merged.formId = incoming.formId || null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'activeResource')) {
        merged.activeResource = incoming.activeResource || null;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'clarificationMode')) {
        merged.clarificationMode = normalizeClarificationMode(incoming.clarificationMode);
    }
    return merged;
};
