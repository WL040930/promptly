import sequelize from '../../db/index.js';
import { Form, Workflow, WorkflowVersion } from '../../models/index.js';
import { validateWorkflow } from '../engine/workflowValidator.js';
import NodeRegistry from '../../utils/NodeRegistry.js';
import { deactivateWorkflowTriggerBindings, syncLiveTriggerBindings } from '../triggers/workflowTriggerBindingService.js';
import { compileWorkflowBindings, normalizeWorkflowReferences, validateWorkflowExpressions } from '../../../shared/workflowExpressions.js';

const revisionConflict = (expected, current) => {
    const error = new Error('This automation changed while you were editing it. Refresh and try again.');
    error.code = 'AUTOMATION_REVISION_CONFLICT';
    error.status = 409;
    error.expectedRevision = expected;
    error.currentRevision = current;
    return error;
};

const validateGraph = ({ nodes = [], edges = [], isActive = false }) => {
    const validation = validateWorkflow({ nodes, edges, isActive, registry: NodeRegistry });
    if (!validation.valid) {
        const error = new Error('Invalid automation definition.');
        error.code = 'AUTOMATION_INVALID_GRAPH';
        error.status = 400;
        error.issues = validation.issues;
        throw error;
    }
};

const graphMatches = (leftNodes = [], leftEdges = [], rightNodes = [], rightEdges = []) => (
    JSON.stringify(leftNodes || []) === JSON.stringify(rightNodes || [])
    && JSON.stringify(leftEdges || []) === JSON.stringify(rightEdges || [])
);

const schemaForNode = node => NodeRegistry.getDefinition?.(node?.type, node?.subType)?.configSchema || node?.schema || {};

const formForNodes = async ({ nodes = [], userId, transaction }) => {
    const formId = (nodes || []).find(node => node?.subType === 'form-submission')?.config?.formId;
    if (!formId) return null;
    return Form.findOne({ where: { id: formId, userId }, transaction });
};

/**
 * Normalize every user/API workflow write at the persistence boundary. This
 * keeps old workflows readable while guaranteeing that the next successful
 * save cannot retain a raw workflow reference in a workflow-expression field.
 */
const isRepairableDanglingIssue = issue => issue?.code === 'WORKFLOW_REFERENCE_SOURCE_UNKNOWN';

export const normalizeWorkflowForWrite = async ({ nodes = [], edges = [], userId, transaction = null, allowDanglingReferences = false } = {}) => {
    const form = await formForNodes({ nodes, userId, transaction });
    const formSchema = form?.toJSON?.() || null;
    const compiled = compileWorkflowBindings({ nodes, formSchema });
    const normalized = normalizeWorkflowReferences({
        nodes: compiled.nodes,
        edges,
        formSchema,
        schemaForNode,
        rejectLegacy: false
    });
    const issues = [
        ...compiled.issues,
        ...normalized.issues,
        ...validateWorkflowExpressions({ nodes: normalized.nodes, edges, formSchema })
    ];
    const warnings = allowDanglingReferences ? issues.filter(isRepairableDanglingIssue) : [];
    const blockingIssues = allowDanglingReferences ? issues.filter(issue => !isRepairableDanglingIssue(issue)) : issues;
    if (blockingIssues.length > 0) {
        const error = new Error([...new Set(blockingIssues.map(item => item.message).filter(Boolean))].join(' '));
        error.code = 'AUTOMATION_WORKFLOW_REFERENCE_INVALID';
        error.status = 409;
        error.issues = blockingIssues;
        throw error;
    }
    return {
        nodes: normalized.nodes,
        repairs: [...compiled.repairs, ...normalized.repairs],
        warnings
    };
};

export const saveAutomationDraft = async ({ automationId, userId, nodes, edges, expectedRevision, source = 'visual', summary = null, transaction: externalTransaction = null }) => {
    const save = async transaction => {
        const automation = await Workflow.findOne({
            where: { id: automationId, userId },
            transaction,
            lock: transaction.LOCK.UPDATE
        });
        if (!automation) {
            const error = new Error('Automation not found.');
            error.status = 404;
            throw error;
        }

        if (expectedRevision !== undefined && Number(expectedRevision) !== Number(automation.revision)) {
            throw revisionConflict(expectedRevision, automation.revision);
        }

        const normalized = await normalizeWorkflowForWrite({ nodes, edges, userId, transaction, allowDanglingReferences: true });
        validateGraph({ nodes: normalized.nodes, edges, isActive: false });
        // Graph edits update only the working draft. Publishing is the sole
        // operation that creates a release in version history.
        const nextRevision = Number(automation.revision || 0) + 1;
        await automation.update({ nodes: normalized.nodes, edges, revision: nextRevision }, { transaction });
        return { automation, version: null, warnings: normalized.warnings || [] };
    };
    return externalTransaction ? save(externalTransaction) : sequelize.transaction(save);
};

export const publishAutomation = async ({ automationId, userId }) => sequelize.transaction(async transaction => {
    const automation = await Workflow.findOne({ where: { id: automationId, userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!automation) {
        const error = new Error('Automation not found.');
        error.status = 404;
        throw error;
    }

    // Publishing is also a workflow write. Normalize a historical draft before
    // it can become a new immutable release, and fail closed if its references
    // cannot be repaired from the current graph/form snapshot.
    const normalized = await normalizeWorkflowForWrite({
        nodes: automation.nodes || [],
        edges: automation.edges || [],
        userId,
        transaction
    });
    if (JSON.stringify(normalized.nodes) !== JSON.stringify(automation.nodes || [])) {
        await automation.update({ nodes: normalized.nodes }, { transaction });
    }
    const releaseNodes = normalized.nodes;
    const releaseEdges = automation.edges || [];

    // A release is the only immutable snapshot created by the normal product
    // flow. Draft edits are autosaved, tested independently, and never need a
    // separate "save version" ceremony before they can be released.
    validateGraph({ nodes: releaseNodes, edges: releaseEdges, isActive: true });
    const published = automation.publishedRevisionId
        ? await WorkflowVersion.findOne({ where: { id: automation.publishedRevisionId, workflowId: automation.id }, transaction })
        : null;
    let release = published;
    if (!published || !graphMatches(releaseNodes, releaseEdges, published.nodes, published.edges)) {
        const latest = await WorkflowVersion.findOne({ where: { workflowId: automation.id }, order: [['versionNumber', 'DESC']], transaction });
        release = await WorkflowVersion.create({
            workflowId: automation.id,
            versionNumber: Number(latest?.versionNumber || 0) + 1,
            baseRevisionId: automation.publishedRevisionId || null,
            nodes: releaseNodes,
            edges: releaseEdges,
            source: 'release',
            summary: 'Published release'
        }, { transaction });
    }
    await automation.update({ isActive: true, status: 'Live', publishedRevisionId: release.id, draftRevisionId: release.id }, { transaction });
    await syncLiveTriggerBindings({ workflow: automation, revision: release, transaction });
    return automation;
});

export const pauseAutomation = async ({ automationId, userId }) => {
    const automation = await Workflow.findOne({ where: { id: automationId, userId } });
    if (!automation) {
        const error = new Error('Automation not found.');
        error.status = 404;
        throw error;
    }
    await sequelize.transaction(async transaction => {
        await automation.update({ isActive: false, status: 'Paused' }, { transaction });
        await deactivateWorkflowTriggerBindings({ workflowId: automation.id, transaction });
    });
    return automation;
};
