import { User, Connection } from './core/index.js';
import { AssistantThread, AssistantMessage } from './assistant/index.js';
import { AgentRun } from './agent/index.js';
import { Form, FormResponse } from './forms/index.js';
import { Workflow, WorkflowVersion } from './workflows/index.js';
import { AutomationRun, EmailDelivery, WorkflowContinuation, Asset, DashboardRunMetric } from './execution/index.js';
import { TriggerSubscription, TriggerEvent, DatabaseChangeEvent, WorkflowTriggerBinding } from './triggers/index.js';
import { KnowledgeBase, KnowledgeDocument, KnowledgeChunk } from './knowledge/index.js';

Connection.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
User.hasMany(Connection, { foreignKey: 'userId', as: 'connections', onDelete: 'CASCADE' });
// --- Workflow Associations ---
Workflow.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Workflow, { foreignKey: 'userId', as: 'workflows' });

Workflow.hasMany(WorkflowVersion, { foreignKey: 'workflowId', as: 'versions', onDelete: 'CASCADE' });
WorkflowVersion.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow' });
Workflow.hasMany(WorkflowTriggerBinding, { foreignKey: 'workflowId', as: 'triggerBindings', onDelete: 'CASCADE' });
WorkflowTriggerBinding.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow', onDelete: 'CASCADE' });

// --- Form Associations ---
Form.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Form, { foreignKey: 'userId', as: 'forms', onDelete: 'CASCADE' });

FormResponse.belongsTo(Form, {
    foreignKey: { name: 'formId', allowNull: false },
    as: 'form',
    onDelete: 'CASCADE'
});
Form.hasMany(FormResponse, {
    foreignKey: { name: 'formId', allowNull: false },
    as: 'responses',
    onDelete: 'CASCADE'
});

// --- Automation run associations ---
AutomationRun.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
User.hasMany(AutomationRun, { foreignKey: 'userId', as: 'runs', onDelete: 'CASCADE' });
AutomationRun.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow', onDelete: 'CASCADE' });
Workflow.hasMany(AutomationRun, { foreignKey: 'workflowId', as: 'runs', onDelete: 'CASCADE' });
AutomationRun.hasMany(WorkflowContinuation, { foreignKey: 'runId', as: 'continuations', onDelete: 'CASCADE' });
WorkflowContinuation.belongsTo(AutomationRun, { foreignKey: 'runId', as: 'run', onDelete: 'CASCADE' });
WorkflowContinuation.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow', onDelete: 'CASCADE' });
WorkflowContinuation.belongsTo(User, { foreignKey: 'resolvedBy', as: 'resolver', onDelete: 'SET NULL' });
Asset.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Asset, { foreignKey: 'userId', as: 'assets', onDelete: 'CASCADE' });
KnowledgeBase.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(KnowledgeBase, { foreignKey: 'userId', as: 'knowledgeBases', onDelete: 'CASCADE' });
KnowledgeDocument.belongsTo(KnowledgeBase, { foreignKey: 'knowledgeBaseId', as: 'knowledgeBase', onDelete: 'CASCADE' });
KnowledgeBase.hasMany(KnowledgeDocument, { foreignKey: 'knowledgeBaseId', as: 'documents', onDelete: 'CASCADE' });
KnowledgeChunk.belongsTo(KnowledgeDocument, { foreignKey: 'documentId', as: 'document', onDelete: 'CASCADE' });
KnowledgeDocument.hasMany(KnowledgeChunk, { foreignKey: 'documentId', as: 'chunks', onDelete: 'CASCADE' });

// --- Assistant associations ---
AssistantThread.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
User.hasMany(AssistantThread, { foreignKey: 'userId', as: 'assistantThreads', onDelete: 'CASCADE' });
AssistantThread.belongsTo(Form, { foreignKey: 'formId', as: 'form', onDelete: 'CASCADE' });
Form.hasOne(AssistantThread, { foreignKey: 'formId', as: 'assistantThread', onDelete: 'CASCADE' });
AssistantThread.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow', onDelete: 'CASCADE' });
Workflow.hasOne(AssistantThread, { foreignKey: 'workflowId', as: 'assistantThread', onDelete: 'CASCADE' });
AssistantThread.hasMany(AssistantMessage, { foreignKey: 'threadId', as: 'messages', onDelete: 'CASCADE' });
AssistantMessage.belongsTo(AssistantThread, { foreignKey: 'threadId', as: 'thread', onDelete: 'CASCADE' });

// --- Agent Associations ---
AgentRun.belongsTo(AssistantThread, { foreignKey: 'threadId', as: 'thread', onDelete: 'CASCADE' });
AssistantThread.hasMany(AgentRun, { foreignKey: 'threadId', as: 'agentRuns', onDelete: 'CASCADE' });

AgentRun.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(AgentRun, { foreignKey: 'userId', as: 'agentRuns', onDelete: 'CASCADE' });

export {
    User,
    Connection,
    Workflow,
    Form,
    FormResponse,
    AutomationRun,
    DashboardRunMetric,
    WorkflowContinuation,
    Asset,
    KnowledgeBase,
    KnowledgeDocument,
    KnowledgeChunk,
    AssistantThread,
    AssistantMessage,
    WorkflowVersion,
    EmailDelivery,
    TriggerSubscription,
    WorkflowTriggerBinding,
    TriggerEvent,
    DatabaseChangeEvent,
    AgentRun
};
