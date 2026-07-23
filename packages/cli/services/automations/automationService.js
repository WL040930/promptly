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
        const nextRevision = Number(automation.revision || 0) + 1;
        const version = await WorkflowVersion.create({
            workflowId: automation.id,
            versionNumber: nextRevision,
            baseRevisionId: String(automation.revision || 0),
            nodes,
            edges,
            source,
            summary
        }, { transaction });

        await automation.update({ nodes, edges, revision: nextRevision, draftRevisionId: version.id }, { transaction });
        return { automation, version };
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
    validateGraph({ nodes: automation.nodes || [], edges: automation.edges || [], isActive: true });
    await automation.update({ isActive: true, status: 'Active', publishedRevisionId: automation.draftRevisionId });
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
    const existing = await WorkflowVersion.findOne({ where: { workflowId: automation.id, versionNumber: automation.revision || 1 } });
    if (existing) return existing;
    return WorkflowVersion.create({
        workflowId: automation.id,
        versionNumber: automation.revision || 1,
        baseRevisionId: String(automation.revision || 1),
        nodes: automation.nodes || [],
        edges: automation.edges || [],
        source,
        summary
    });
};
