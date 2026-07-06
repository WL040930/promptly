import User from './User.js';
import Folder from './Folder.js';
import Workflow from './Workflow.js';
import Form from './Form.js';
import FormResponse from './FormResponse.js';
import ExecutionLog from './ExecutionLog.js';
import ChatSession from './ChatSession.js';
import ChatMessage from './ChatMessage.js';
import FormChatMessage from './FormChatMessage.js';

// --- Folder Associations ---
Folder.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Folder, { foreignKey: 'userId', as: 'folders' });

Folder.belongsTo(Folder, { foreignKey: 'parentId', as: 'parent' });
Folder.hasMany(Folder, { foreignKey: 'parentId', as: 'subfolders' });

// --- Workflow Associations ---
Workflow.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Workflow, { foreignKey: 'userId', as: 'workflows' });

Workflow.belongsTo(Folder, { foreignKey: 'folderId', as: 'folder' });
Folder.hasMany(Workflow, { foreignKey: 'folderId', as: 'workflows' });

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

export {
    User,
    Folder,
    Workflow,
    Form,
    FormResponse,
    ExecutionLog,
    ChatSession,
    ChatMessage,
    FormChatMessage
};
