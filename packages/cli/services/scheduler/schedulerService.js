import cron from 'node-cron';
import Workflow from '../../models/workflows/Workflow.js';
import { executeWorkflow } from '../engine/executionEngine.js';

/**
 * SchedulerService
 * ─────────────────
 * Manages cron jobs for schedule-triggered workflows.
 *
 * Usage:
 *   import SchedulerService from './schedulerService.js';
 *   await SchedulerService.start();          // Called once on server boot
 *   SchedulerService.register(workflowId, userId, cronExpr, timezone);
 *   SchedulerService.deregister(workflowId);
 */

// Map of workflowId → node-cron ScheduledTask
const jobs = new Map();

/**
 * Register (or replace) a cron job for the given workflow.
 */
function register(workflowId, userId, cronExpression, timezone = 'UTC') {
    // Deregister any existing job first
    deregister(workflowId);

    if (!cronExpression || !cron.validate(cronExpression)) {
        console.warn(`[Scheduler] Invalid cron expression "${cronExpression}" for workflow ${workflowId} — skipping.`);
        return;
    }

    const task = cron.schedule(
        cronExpression,
        async () => {
            console.log(`[Scheduler] Firing workflow ${workflowId} (${cronExpression})`);
            try {
                const timestamp = new Date().toISOString();
                await executeWorkflow(workflowId, userId, {
                    timestamp,
                    cronExpression,
                    idempotencyKey: `${workflowId}:${timestamp}`
                }, { runType: 'production', trigger: 'schedule' });
            } catch (err) {
                console.error(`[Scheduler] Execution failed for workflow ${workflowId}:`, err.message);
            }
        },
        { timezone, scheduled: true }
    );

    jobs.set(workflowId, task);
    console.log(`[Scheduler] Registered job for workflow ${workflowId} — "${cronExpression}" (${timezone})`);
}

/**
 * Stop and remove a cron job for the given workflow.
 */
function deregister(workflowId) {
    const existing = jobs.get(workflowId);
    if (existing) {
        existing.stop();
        jobs.delete(workflowId);
        console.log(`[Scheduler] Deregistered job for workflow ${workflowId}`);
    }
}

/**
 * Load all Active workflows with a schedule trigger and register their cron jobs.
 * Called once on server boot.
 */
async function start() {
    console.log('[Scheduler] Starting — scanning for active schedule-triggered workflows…');
    try {
        const workflows = await Workflow.findAll({ where: { isActive: true } });
        let count = 0;
        for (const workflow of workflows) {
            const triggerNode = (workflow.nodes || []).find(
                n => n.type === 'trigger' && n.subType === 'schedule'
            );
            if (triggerNode) {
                const { cronExpression = '0 9 * * *', timezone = 'UTC' } = triggerNode.config || {};
                register(workflow.id, workflow.userId, cronExpression, timezone);
                count++;
            }
        }
        console.log(`[Scheduler] Registered ${count} schedule job(s).`);
    } catch (err) {
        console.error('[Scheduler] Failed to start:', err.message);
    }
}

const SchedulerService = { start, register, deregister };
export default SchedulerService;
