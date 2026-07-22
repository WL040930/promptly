import { Workflow } from '../../models/index.js';
import { executeWorkflow } from '../../services/engine/executionEngine.js';
import asyncHandler from '../../utils/asyncHandler.js';

/**
 * POST /api/webhooks/:webhookId
 * Public endpoint — no auth required.
 * Finds all Active workflows with a webhook trigger node bound to this webhookId.
 * Async workflows return 202; one explicitly configured sync workflow may return
 * the output of its Format Response node.
 */
export const handleWebhook = asyncHandler(async (req, res) => {
    const { webhookId } = req.params;

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

        const matches = [];
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

            matches.push({ workflow, triggerNode });
        }

        const syncMatches = matches.filter(match => match.triggerNode.config?.deliveryMode === 'sync');
        if (syncMatches.length > 1) return res.status(409).json({ message: 'More than one synchronous workflow is configured for this webhook.' });
        if (syncMatches.length === 1) {
            const { workflow } = syncMatches[0];
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Synchronous webhook timed out after 10 seconds.')), 10_000));
            let log;
            try {
                log = await Promise.race([
                    executeWorkflow(workflow.id, workflow.userId, initialPayload, { runType: 'production', trigger: 'webhook-sync' }),
                    timeout
                ]);
            } catch (error) {
                return res.status(504).json({ status: 'failed', webhookId, error: error.message });
            }
            if (log.status !== 'Success') return res.status(502).json({ status: 'failed', webhookId, error: log.error || 'Synchronous workflow failed.' });
            const output = log.output || {};
            for (const [name, value] of Object.entries(output.headers || {})) res.setHeader(name, value);
            return res.status(Number(output.statusCode) || 200).send(output.body ?? output.output ?? { status: 'ok', webhookId });
        }
        res.status(202).json({ status: 'accepted', webhookId, workflows: matches.length });
        for (const { workflow } of matches) executeWorkflow(workflow.id, workflow.userId, initialPayload, { runType: 'production', trigger: 'webhook' })
            .catch(err => console.error(`[WebhookTrigger] Dispatch failed for workflow ${workflow.id}:`, err.message));
    } catch (err) {
        console.error('[WebhookTrigger] Failed to scan workflows:', err.message);
        if (!res.headersSent) res.status(500).json({ status: 'failed', webhookId, error: 'Webhook dispatch could not be started.' });
    }
});
