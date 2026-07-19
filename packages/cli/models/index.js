import { User, Folder, Connection, OnboardingProgress } from './core/index.js';
import { ChatSession, ChatMessage } from './chat/index.js';
import { AgentRun } from './agent/index.js';
import { Form, FormResponse, FormChatMessage, FormAIState } from './forms/index.js';
import { Workflow, WorkflowVersion } from './workflows/index.js';
import { ExecutionLog, EmailDelivery } from './execution/index.js';
import { TriggerSubscription, TriggerEvent, DatabaseChangeEvent } from './triggers/index.js';

// --- Folder Associations ---
Folder.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Folder, { foreignKey: 'userId', as: 'folders' });
Connection.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
User.hasMany(Connection, { foreignKey: 'userId', as: 'connections', onDelete: 'CASCADE' });
OnboardingProgress.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
User.hasOne(OnboardingProgress, { foreignKey: 'userId', as: 'onboarding', onDelete: 'CASCADE' });

Folder.belongsTo(Folder, { foreignKey: 'parentId', as: 'parent' });
Folder.hasMany(Folder, { foreignKey: 'parentId', as: 'subfolders' });

// --- Workflow Associations ---
Workflow.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Workflow, { foreignKey: 'userId', as: 'workflows' });

Workflow.belongsTo(Folder, { foreignKey: 'folderId', as: 'folder' });
Folder.hasMany(Workflow, { foreignKey: 'folderId', as: 'workflows' });

Workflow.hasMany(WorkflowVersion, { foreignKey: 'workflowId', as: 'versions', onDelete: 'CASCADE' });
WorkflowVersion.belongsTo(Workflow, { foreignKey: 'workflowId', as: 'workflow' });

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
    Folder,
    Connection,
    OnboardingProgress,
    Workflow,
    Form,
    FormResponse,
    ExecutionLog,
    ChatSession,
    ChatMessage,
    FormChatMessage,
    FormAIState,
    WorkflowVersion,
    EmailDelivery,
    TriggerSubscription,
    TriggerEvent,
    DatabaseChangeEvent,
    AgentRun
};
