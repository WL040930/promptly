import { Workflow } from '../../models/index.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import asyncHandler from '../../utils/asyncHandler.js';

/**
 * POST /api/webhooks/:webhookId
 * Public endpoint — no auth required.
 * Finds all Active workflows with a webhook trigger node bound to this webhookId,
 * verifies the optional secret, and dispatches them fire-and-forget.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
    const { webhookId } = req.params;

    // Respond immediately — never block the caller waiting for workflow execution.
    res.status(202).json({ status: 'accepted', webhookId });

    const initialPayload = {
        body:      req.body      || {},
        headers:   req.headers   || {},
        method:    req.method,
        timestamp: new Date().toISOString(),
        ...(req.headers['x-idempotency-key'] ? { idempotencyKey: String(req.headers['x-idempotency-key']) } : {})
    };

    try {
        // Scan ALL workflows (across all users) for a matching webhookId.
        // We can't filter by userId since the caller is unauthenticated.
        const allWorkflows = await Workflow.findAll({ where: { isActive: true } });

        for (const workflow of allWorkflows) {
            const triggerNode = (workflow.nodes || []).find(
                n => n.type === 'trigger' && n.subType === 'webhook' && n.config?.webhookId === webhookId
            );

            if (!triggerNode) continue;

            // Optional secret verification
            const configuredSecret = triggerNode.config?.secret;
            if (configuredSecret) {
                const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-hub-signature-256'];
                if (providedSecret !== configuredSecret) {
                    console.warn(`[WebhookTrigger] Secret mismatch for workflow ${workflow.id} — skipping.`);
                    continue;
                }
            }

            executeWorkflow(workflow.id, workflow.userId, initialPayload)
                .catch(err => console.error(`[WebhookTrigger] Dispatch failed for workflow ${workflow.id}:`, err.message));
        }
    } catch (err) {
        console.error('[WebhookTrigger] Failed to scan workflows:', err.message);
    }
});
