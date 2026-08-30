import asyncHandler from '../../utils/asyncHandler.js';
import { Workflow } from '../../models/index.js';
import { workflowAssistant } from '../../services/ai/workflow/workflowAssistant.js';
import { assertWritableWorkspaceRecord } from '../../utils/workspaceScope.js';

const acceptsSSE = req => String(req.headers.accept || '').includes('text/event-stream');
const ownedWorkflow = (workflowId, userId) => Workflow.findOne({ where: { id: workflowId, userId } });
const writableWorkflow = async (req, res) => {
    const workflow = await Workflow.findOne({ where: { id: req.params.id, userId: req.user.id } });
    if (!workflow) {
        res.status(404).json({ message: 'Workflow not found' });
        return null;
    }
    assertWritableWorkspaceRecord(workflow);
    return workflow;
};

export const getWorkflowAIChat = asyncHandler(async (req, res) => {
    const workflow = await ownedWorkflow(req.params.id, req.user.id);
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    if (workflow.demoKey) return res.json({ messages: [], nextBefore: null, state: null });
    const result = await workflowAssistant.getHistory({
        workflowId: req.params.id,
        userId: req.user.id,
        limit: req.query.limit,
        before: req.query.before || null
    });
    res.json(result);
});

export const clearWorkflowAIChat = asyncHandler(async (req, res) => {
    if (!await writableWorkflow(req, res)) return;
    const result = await workflowAssistant.clearChat({ workflowId: req.params.id, userId: req.user.id });
    res.json(result);
});

export const resetWorkflowAIContext = asyncHandler(async (req, res) => {
    if (!await writableWorkflow(req, res)) return;
    const result = await workflowAssistant.resetContext({ workflowId: req.params.id, userId: req.user.id });
    res.json(result);
});

export const submitWorkflowAITurn = asyncHandler(async (req, res) => {
    if (!await writableWorkflow(req, res)) return;
    const useSSE = acceptsSSE(req);
    if (useSSE) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
    }
    const emit = data => {
        if (useSSE && !res.writableEnded) {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
            res.flush?.();
        }
    };
    try {
        const result = await workflowAssistant.submitTurn({
            workflowId: req.params.id,
            userId: req.user.id,
            command: req.body?.command,
            clarificationMode: req.body?.clarificationMode,
            expectedStateVersion: req.body?.expectedStateVersion,
            requestId: req.body?.requestId,
            onProgress: progress => emit({ type: 'progress', ...progress })
        });
        if (useSSE) {
            emit({ type: 'complete', result });
            return res.end();
        }
        res.status(201).json(result);
    } catch (error) {
        if (useSSE && !res.writableEnded) {
            emit({
                type: 'error',
                code: error.code || 'WORKFLOW_AI_FAILED',
                message: error.message || 'Workflow AI turn failed.',
                issues: error.issues || [],
                ...(Number.isInteger(error.currentStateVersion) ? { currentStateVersion: error.currentStateVersion } : {}),
                ...(error.recovery ? { recovery: error.recovery } : {})
            });
            return res.end();
        }
        throw error;
    }
});

export const decideWorkflowAIProposal = asyncHandler(async (req, res) => {
    if (!await writableWorkflow(req, res)) return;
    const result = await workflowAssistant.decideProposal({
        workflowId: req.params.id,
        userId: req.user.id,
        proposalMessageId: req.params.messageId,
        action: req.body?.action || 'accept',
        expectedStateVersion: req.body?.expectedStateVersion
    });
    res.json(result);
});
