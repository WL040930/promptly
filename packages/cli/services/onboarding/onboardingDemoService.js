import sequelize from '../../db/index.js';
import {
    AssistantThread,
    AutomationRun,
    Form,
    FormResponse,
    User,
    Workflow,
    WorkflowContinuation,
    WorkflowTriggerBinding,
    WorkflowVersion
} from '../../models/index.js';
import { ONBOARDING_DEMO_KEY, workspaceWhere } from '../../utils/workspaceScope.js';

const DEMO_RUN_COUNT = 3;

const demoFormFields = [
    { id: 'demo-requester', label: 'Your name', type: 'text', required: true, placeholder: 'Alex Morgan' },
    { id: 'demo-email', label: 'Work email', type: 'email', required: true, placeholder: 'alex@example.com' },
    { id: 'demo-category', label: 'Request category', type: 'select', required: true, options: ['Billing', 'Technical', 'General'] },
    { id: 'demo-summary', label: 'What do you need help with?', type: 'textarea', required: true, placeholder: 'Describe the request in a few sentences.' }
];

const sampleNodesFor = formId => [
    {
        id: 'demo-form-trigger',
        type: 'trigger',
        subType: 'form-submission',
        title: 'New support request',
        description: 'Start when the support form receives a response.',
        config: { formId },
        position: { x: 80, y: 180 }
    },
    {
        id: 'demo-ai-task',
        type: 'ai',
        subType: 'aiTask',
        title: 'Classify the request',
        description: 'Use AI to understand the incoming request.',
        config: {
            taskType: 'categorize',
            prompt: 'Classify the support request and explain the reason briefly.',
            categories: ['billing', 'technical', 'general']
        },
        position: { x: 380, y: 180 }
    },
    {
        id: 'demo-approval',
        type: 'logic',
        subType: 'approval',
        title: 'Review before replying',
        description: 'Pause the workflow so a person can make the final decision.',
        config: {
            title: 'Review the support request',
            instructions: 'Check the category and choose the next path.'
        },
        position: { x: 680, y: 180 }
    },
    {
        id: 'demo-log',
        type: 'logic',
        subType: 'log',
        title: 'Record the outcome',
        description: 'Keep a visible execution note while learning the workflow.',
        config: {
            logMessage: 'Support request reviewed.',
            logLevel: 'info',
            includeContext: false
        },
        position: { x: 980, y: 180 }
    }
];

const sampleEdges = [
    { id: 'demo-edge-trigger-ai', source: 'demo-form-trigger', target: 'demo-ai-task', sourceHandle: 'triggerData', targetHandle: 'inputData' },
    { id: 'demo-edge-ai-approval', source: 'demo-ai-task', target: 'demo-approval', sourceHandle: 'outputData', targetHandle: 'inputData' },
    { id: 'demo-edge-approval-log', source: 'demo-approval', target: 'demo-log', sourceHandle: 'approved', targetHandle: 'triggerData' }
];

const runSteps = nodes => nodes.map((node, index) => ({
    nodeId: node.id,
    name: node.title,
    status: index === 2 ? 'waiting' : 'succeeded',
    startedAt: new Date(Date.now() - (index + 1) * 7000).toISOString(),
    completedAt: index === 2 ? null : new Date(Date.now() - (index + 1) * 5000).toISOString(),
    output: index === 1 ? { category: 'technical', confidence: 0.96 } : { recorded: true }
}));

const demoSummary = ({ workflow, form, runs }) => ({
    scope: 'demo',
    demoKey: ONBOARDING_DEMO_KEY,
    workflowId: workflow?.id || null,
    formId: form?.id || null,
    runIds: runs.map(run => run.id)
});

const destroyDemoRows = async ({ userId, transaction }) => {
    const scope = workspaceWhere({ userId, scope: 'demo' });
    const workflows = await Workflow.findAll({ where: scope, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
    const forms = await Form.findAll({ where: scope, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE });
    const workflowIds = workflows.map(workflow => workflow.id);
    const formIds = forms.map(form => form.id);

    if (workflowIds.length > 0) {
        await AssistantThread.destroy({ where: { workflowId: workflowIds }, transaction });
        await WorkflowContinuation.destroy({ where: { workflowId: workflowIds }, transaction });
        await WorkflowTriggerBinding.destroy({ where: { workflowId: workflowIds }, transaction });
        await WorkflowVersion.destroy({ where: { workflowId: workflowIds }, transaction });
    }
    if (formIds.length > 0) {
        await AssistantThread.destroy({ where: { formId: formIds }, transaction });
        await FormResponse.destroy({ where: { formId: formIds }, transaction });
    }
    await AutomationRun.destroy({ where: scope, transaction });
    await Workflow.destroy({ where: scope, transaction });
    await Form.destroy({ where: scope, transaction });

    return { workflows: workflowIds.length, forms: formIds.length };
};

const seedDemoRows = async ({ userId, transaction }) => {
    const now = Date.now();
    const form = await Form.create({
        title: 'Support request intake',
        description: 'A small example form that feeds the support triage automation.',
        settings: { accentColor: '#5b4ee8', acceptingResponses: false, demo: true },
        fields: demoFormFields,
        responseCount: 1,
        demoKey: ONBOARDING_DEMO_KEY,
        userId
    }, { transaction });

    const nodes = sampleNodesFor(form.id);
    const workflow = await Workflow.create({
        name: 'Support request triage',
        description: 'A read-only example showing how input, AI, approval, and logging fit together.',
        isActive: false,
        status: 'Draft',
        icon: 'sparkles',
        iconColor: 'text-indigo-600',
        iconBg: 'bg-indigo-100',
        nodes,
        edges: sampleEdges,
        revision: 1,
        demoKey: ONBOARDING_DEMO_KEY,
        userId
    }, { transaction });

    await FormResponse.create({
        formId: form.id,
        responseData: {
            'demo-requester': 'Jordan Lee',
            'demo-email': 'jordan@example.com',
            'demo-category': 'Technical',
            'demo-summary': 'The weekly report is missing the latest submissions.'
        },
        snapshot: demoFormFields,
        createdAt: new Date(now - 2 * 86400000),
        updatedAt: new Date(now - 2 * 86400000)
    }, { transaction });

    const definitionSnapshot = { nodes, edges: sampleEdges };
    const runs = await AutomationRun.bulkCreate([
        {
            workflowId: workflow.id,
            userId,
            demoKey: ONBOARDING_DEMO_KEY,
            definitionSnapshot,
            workflowNameSnapshot: workflow.name,
            status: 'succeeded',
            trigger: 'form-submission',
            state: { category: 'technical', reviewed: true },
            durationMs: 1840,
            tags: ['demo', 'onboarding'],
            steps: runSteps(nodes).map(step => ({ ...step, status: 'succeeded', completedAt: step.completedAt || new Date(now - 3000).toISOString() })),
            output: { message: 'Support request classified and recorded.' },
            completedAt: new Date(now - 2 * 86400000),
            createdAt: new Date(now - 2 * 86400000),
            updatedAt: new Date(now - 2 * 86400000)
        },
        {
            workflowId: workflow.id,
            userId,
            demoKey: ONBOARDING_DEMO_KEY,
            definitionSnapshot,
            workflowNameSnapshot: workflow.name,
            status: 'waiting',
            trigger: 'form-submission',
            state: { category: 'billing', reviewed: false },
            suspendedNodeId: 'demo-approval',
            durationMs: null,
            tags: ['demo', 'onboarding'],
            steps: runSteps(nodes),
            output: { message: 'Waiting for a human review.' },
            createdAt: new Date(now - 1 * 86400000),
            updatedAt: new Date(now - 1 * 86400000)
        },
        {
            workflowId: workflow.id,
            userId,
            demoKey: ONBOARDING_DEMO_KEY,
            definitionSnapshot,
            workflowNameSnapshot: workflow.name,
            status: 'failed',
            trigger: 'manual-test',
            state: { category: 'general' },
            durationMs: 920,
            error: 'Example failure: the approval step did not receive the expected input.',
            tags: ['demo', 'onboarding'],
            steps: runSteps(nodes).map((step, index) => index === 2 ? { ...step, status: 'failed', error: 'Expected review input was missing.' } : { ...step, status: 'succeeded', completedAt: step.completedAt || new Date(now - 3000).toISOString() }),
            output: null,
            completedAt: new Date(now - 3 * 3600000),
            createdAt: new Date(now - 3 * 3600000),
            updatedAt: new Date(now - 3 * 3600000)
        }
    ], { transaction });

    return demoSummary({ workflow, form, runs });
};

const withUserLock = async (userId, work) => sequelize.transaction(async transaction => {
    const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE, attributes: ['id'] });
    if (!user) {
        const error = new Error('User not found.');
        error.status = 404;
        throw error;
    }
    return work({ transaction });
});

export const ensureDemoWorkspace = userId => withUserLock(userId, async ({ transaction }) => {
    const workflow = await Workflow.findOne({ where: workspaceWhere({ userId, scope: 'demo' }), transaction });
    const form = await Form.findOne({ where: workspaceWhere({ userId, scope: 'demo' }), transaction });
    const runs = await AutomationRun.findAll({ where: workspaceWhere({ userId, scope: 'demo' }), transaction, order: [['createdAt', 'ASC']] });
    if (workflow && form && runs.length >= DEMO_RUN_COUNT) return demoSummary({ workflow, form, runs });

    await destroyDemoRows({ userId, transaction });
    const seeded = await seedDemoRows({ userId, transaction });
    return { ...seeded, created: true };
});

export const resetDemoWorkspace = userId => withUserLock(userId, async ({ transaction }) => {
    await destroyDemoRows({ userId, transaction });
    const seeded = await seedDemoRows({ userId, transaction });
    return { ...seeded, reset: true };
});

export const deleteDemoWorkspace = userId => withUserLock(userId, ({ transaction }) => destroyDemoRows({ userId, transaction }));

