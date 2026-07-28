import { WorkflowTriggerBinding } from '../../models/index.js';
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
        const bindings = await WorkflowTriggerBinding.findAll({
            where: { kind: 'webhook', resourceId: webhookId, status: 'active' },
            attributes: ['workflowId', 'revisionId', 'userId', 'config']
        });

        const matches = [];
        for (const binding of bindings) {
            // Optional secret verification
            const configuredSecret = binding.config?.secret;
            if (configuredSecret) {
                const providedSecret = req.headers['x-webhook-secret'] || req.headers['x-hub-signature-256'];
                if (providedSecret !== configuredSecret) {
                    console.warn(`[WebhookTrigger] Secret mismatch for workflow ${binding.workflowId} — skipping.`);
                    continue;
                }
            }
            matches.push(binding);
        }

        const syncMatches = matches.filter(match => match.config?.deliveryMode === 'sync');
        if (syncMatches.length > 1) return res.status(409).json({ message: 'More than one synchronous workflow is configured for this webhook.' });
        if (syncMatches.length === 1) {
            const binding = syncMatches[0];
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Synchronous webhook timed out after 10 seconds.')), 10_000));
            let log;
            try {
                log = await Promise.race([
                    executeWorkflow(binding.workflowId, binding.userId, initialPayload, {
                        runType: 'production',
                        revisionId: binding.revisionId,
                        trigger: 'webhook-sync'
                    }),
                    timeout
                ]);
            } catch (error) {
                return res.status(504).json({ status: 'failed', webhookId, error: error.message });
            }
            if (log.status !== 'succeeded') return res.status(502).json({ status: 'failed', webhookId, error: log.error || 'Synchronous workflow failed.' });
            const output = log.output || {};
            for (const [name, value] of Object.entries(output.headers || {})) res.setHeader(name, value);
            return res.status(Number(output.statusCode) || 200).send(output.body ?? output.output ?? { status: 'ok', webhookId });
        }
        res.status(202).json({ status: 'accepted', webhookId, workflows: matches.length });
        for (const binding of matches) executeWorkflow(binding.workflowId, binding.userId, initialPayload, {
            runType: 'production',
            revisionId: binding.revisionId,
            trigger: 'webhook'
        }).catch(err => console.error(`[WebhookTrigger] Dispatch failed for workflow ${binding.workflowId}:`, err.message));
    } catch (err) {
        console.error('[WebhookTrigger] Failed to load trigger bindings:', err.message);
        if (!res.headersSent) res.status(500).json({ status: 'failed', webhookId, error: 'Webhook dispatch could not be started.' });
    }
});
