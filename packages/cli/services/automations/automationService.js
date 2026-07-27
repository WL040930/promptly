import sequelize from '../../db/index.js';
import { Workflow, WorkflowVersion } from '../../models/index.js';
import { validateWorkflow } from '../engine/workflowValidator.js';
import NodeRegistry from '../../utils/NodeRegistry.js';

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

        validateGraph({ nodes, edges, isActive: false });
        // Graph edits update only the working draft. Publishing is the sole
        // operation that creates a release in version history.
        const nextRevision = Number(automation.revision || 0) + 1;
        await automation.update({ nodes, edges, revision: nextRevision }, { transaction });
        return { automation, version: null };
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

    // A release is the only immutable snapshot created by the normal product
    // flow. Draft edits are autosaved, tested independently, and never need a
    // separate "save version" ceremony before they can be released.
    validateGraph({ nodes: automation.nodes || [], edges: automation.edges || [], isActive: true });
    const published = automation.publishedRevisionId
        ? await WorkflowVersion.findOne({ where: { id: automation.publishedRevisionId, workflowId: automation.id }, transaction })
        : null;
    let release = published;
    if (!published || !graphMatches(automation.nodes, automation.edges, published.nodes, published.edges)) {
        const latest = await WorkflowVersion.findOne({ where: { workflowId: automation.id }, order: [['versionNumber', 'DESC']], transaction });
        release = await WorkflowVersion.create({
            workflowId: automation.id,
            versionNumber: Number(latest?.versionNumber || 0) + 1,
            baseRevisionId: automation.publishedRevisionId || null,
            nodes: automation.nodes || [],
            edges: automation.edges || [],
            source: 'release',
            summary: 'Published release'
        }, { transaction });
    }
    await automation.update({ isActive: true, status: 'Live', publishedRevisionId: release.id, draftRevisionId: release.id }, { transaction });
    return automation;
});

export const pauseAutomation = async ({ automationId, userId }) => {
    const automation = await Workflow.findOne({ where: { id: automationId, userId } });
    if (!automation) {
        const error = new Error('Automation not found.');
        error.status = 404;
        throw error;
    }
    await automation.update({ isActive: false, status: 'Paused' });
    return automation;
};
