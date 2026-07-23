import { User, Connection, OnboardingProgress } from './core/index.js';
import { ChatSession, ChatMessage } from './chat/index.js';
import { AgentRun } from './agent/index.js';
import { Form, FormResponse, FormChatMessage, FormAIState } from './forms/index.js';
import { Workflow, WorkflowVersion, WorkflowAIState, WorkflowChatMessage } from './workflows/index.js';
import { ExecutionLog, EmailDelivery, WorkflowRun, WorkflowContinuation, Asset } from './execution/index.js';
import { TriggerSubscription, TriggerEvent, DatabaseChangeEvent } from './triggers/index.js';
import { KnowledgeBase, KnowledgeDocument, KnowledgeChunk } from './knowledge/index.js';

Connection.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
User.hasMany(Connection, { foreignKey: 'userId', as: 'connections', onDelete: 'CASCADE' });
OnboardingProgress.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
User.hasOne(OnboardingProgress, { foreignKey: 'userId', as: 'onboarding', onDelete: 'CASCADE' });

// --- Workflow Associations ---
Workflow.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Workflow, { foreignKey: 'userId', as: 'workflows' });

Workflow.hasMany(WorkflowVersion, { foreignKey: 'workflowId', as: 'versions', onDelete: 'CASCADE' });
WorkflowVersion.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow' });
Workflow.hasOne(WorkflowAIState, { foreignKey: { name: 'workflowId', allowNull: false }, as: 'aiState', onDelete: 'CASCADE' });
WorkflowAIState.belongsTo(Workflow, { foreignKey: { name: 'workflowId', allowNull: false }, as: 'workflow', onDelete: 'CASCADE' });
Workflow.hasMany(WorkflowChatMessage, { foreignKey: { name: 'workflowId', allowNull: false }, as: 'aiMessages', onDelete: 'CASCADE' });
WorkflowChatMessage.belongsTo(Workflow, { foreignKey: { name: 'workflowId', allowNull: false }, as: 'workflow', onDelete: 'CASCADE' });

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

// --- ExecutionLog Associations ---
ExecutionLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(ExecutionLog, { foreignKey: 'userId', as: 'logs', onDelete: 'CASCADE' });

ExecutionLog.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow' });
Workflow.hasMany(ExecutionLog, { foreignKey: 'workflowId', as: 'logs', onDelete: 'CASCADE' });
WorkflowRun.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow' });
Workflow.hasMany(WorkflowRun, { foreignKey: 'workflowId', as: 'runs', onDelete: 'CASCADE' });
WorkflowRun.belongsTo(User, { foreignKey: 'userId', as: 'user' });
WorkflowRun.hasMany(WorkflowContinuation, { foreignKey: 'runId', as: 'continuations', onDelete: 'CASCADE' });
WorkflowContinuation.belongsTo(WorkflowRun, { foreignKey: 'runId', as: 'run', onDelete: 'CASCADE' });
Asset.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Asset, { foreignKey: 'userId', as: 'assets', onDelete: 'CASCADE' });
KnowledgeBase.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(KnowledgeBase, { foreignKey: 'userId', as: 'knowledgeBases', onDelete: 'CASCADE' });
KnowledgeDocument.belongsTo(KnowledgeBase, { foreignKey: 'knowledgeBaseId', as: 'knowledgeBase', onDelete: 'CASCADE' });
KnowledgeBase.hasMany(KnowledgeDocument, { foreignKey: 'knowledgeBaseId', as: 'documents', onDelete: 'CASCADE' });
KnowledgeChunk.belongsTo(KnowledgeDocument, { foreignKey: 'documentId', as: 'document', onDelete: 'CASCADE' });
KnowledgeDocument.hasMany(KnowledgeChunk, { foreignKey: 'documentId', as: 'chunks', onDelete: 'CASCADE' });

// --- ChatSession Associations ---
ChatSession.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(ChatSession, { foreignKey: 'userId', as: 'chatSessions', onDelete: 'CASCADE' });
ChatSession.belongsTo(Workflow, { foreignKey: 'automationId', as: 'automation', onDelete: 'SET NULL' });
Workflow.hasMany(ChatSession, { foreignKey: 'automationId', as: 'conversations', onDelete: 'SET NULL' });

// --- ChatMessage Associations ---
ChatMessage.belongsTo(ChatSession, { foreignKey: 'sessionId', as: 'session' });
ChatSession.hasMany(ChatMessage, { foreignKey: 'sessionId', as: 'chatMessages', onDelete: 'CASCADE' });

// --- FormChatMessage Associations ---
FormChatMessage.belongsTo(Form, {
    foreignKey: { name: 'formId', allowNull: false },
    as: 'form',
    onDelete: 'CASCADE'
});
Form.hasMany(FormChatMessage, {
    foreignKey: { name: 'formId', allowNull: false },
    as: 'chatMessages',
    onDelete: 'CASCADE'
});

FormAIState.belongsTo(Form, {
    foreignKey: { name: 'formId', allowNull: false },
    as: 'form',
    onDelete: 'CASCADE'
});
Form.hasOne(FormAIState, {
    foreignKey: { name: 'formId', allowNull: false },
    as: 'aiState',
    onDelete: 'CASCADE'
});

// --- Agent Associations ---
AgentRun.belongsTo(ChatSession, { foreignKey: 'sessionId', as: 'session' });
ChatSession.hasMany(AgentRun, { foreignKey: 'sessionId', as: 'agentRuns', onDelete: 'CASCADE' });

AgentRun.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(AgentRun, { foreignKey: 'userId', as: 'agentRuns', onDelete: 'CASCADE' });

export {
    User,
    Connection,
    OnboardingProgress,
    Workflow,
    Form,
    FormResponse,
    ExecutionLog,
    WorkflowRun,
    WorkflowContinuation,
    Asset,
    KnowledgeBase,
    KnowledgeDocument,
    KnowledgeChunk,
    ChatSession,
    ChatMessage,
    FormChatMessage,
    FormAIState,
    WorkflowVersion,
    WorkflowAIState,
    WorkflowChatMessage,
    EmailDelivery,
    TriggerSubscription,
    TriggerEvent,
    DatabaseChangeEvent,
    AgentRun
};
