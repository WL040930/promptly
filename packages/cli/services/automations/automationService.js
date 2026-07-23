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
        // Graph edits update the working draft only. A history record is
        // created explicitly by saveAutomationVersion, so dragging or
        // configuring a node no longer floods version history.
        const nextRevision = Number(automation.revision || 0) + 1;
        await automation.update({ nodes, edges, revision: nextRevision }, { transaction });
        return { automation, version: null };
    };
    return externalTransaction ? save(externalTransaction) : sequelize.transaction(save);
};

export const publishAutomation = async ({ automationId, userId }) => {
    const automation = await Workflow.findOne({ where: { id: automationId, userId } });
    if (!automation) {
        const error = new Error('Automation not found.');
        error.status = 404;
        throw error;
    }
    const draftVersion = automation.draftRevisionId
        ? await WorkflowVersion.findOne({ where: { id: automation.draftRevisionId, workflowId: automation.id } })
        : null;
    if (!draftVersion || !graphMatches(automation.nodes, automation.edges, draftVersion.nodes, draftVersion.edges)) {
        const error = new Error('Save a version before publishing this automation.');
        error.code = 'AUTOMATION_VERSION_REQUIRED';
        error.status = 409;
        throw error;
    }
    validateGraph({ nodes: draftVersion.nodes || [], edges: draftVersion.edges || [], isActive: true });
    await automation.update({ isActive: true, status: 'Active', publishedRevisionId: draftVersion.id });
    return automation;
};

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

export const saveAutomationVersion = async ({ automationId, userId, source = 'system', summary = null }) => {
    const automation = await Workflow.findOne({ where: { id: automationId, userId } });
    if (!automation) {
        const error = new Error('Automation not found.');
        error.status = 404;
        throw error;
    }
    const latest = await WorkflowVersion.findOne({
        where: { workflowId: automation.id },
        order: [['versionNumber', 'DESC']]
    });
    if (latest && graphMatches(automation.nodes, automation.edges, latest.nodes, latest.edges)) return latest;

    const version = await WorkflowVersion.create({
        workflowId: automation.id,
        versionNumber: Number(latest?.versionNumber || 0) + 1,
        baseRevisionId: automation.draftRevisionId || null,
        nodes: automation.nodes || [],
        edges: automation.edges || [],
        source,
        summary
    });
    await automation.update({ draftRevisionId: version.id });
    return version;
};
