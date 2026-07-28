import crypto from 'node:crypto';
import sequelize from '../../db/index.js';
import '../../models/index.js';
import { AutomationRun, DashboardRunMetric, User, Workflow } from '../../models/index.js';

const confirmation = 'promptly-benchmark';
const runCount = Math.max(1000, Math.min(Number(process.env.PERF_RUN_COUNT || 10000), 250000));

if (process.env.PERF_SEED_CONFIRM !== confirmation) {
    console.error('Refusing to create benchmark data. Set PERF_SEED_CONFIRM=' + confirmation + ' to opt in.');
    process.exitCode = 1;
} else {
    const startedAt = performance.now();
    const suffix = crypto.randomUUID().replaceAll('-', '');
    const user = await User.create({ email: 'perf-' + suffix + '@benchmark.invalid', passwordHash: 'benchmark-only' });
    const workflow = await Workflow.create({ name: 'Benchmark workflow ' + suffix.slice(0, 8), status: 'Draft', userId: user.id, nodes: [], edges: [] });
    const now = Date.now();
    const rows = Array.from({ length: runCount }, (_, index) => {
        const completedAt = new Date(now - index * 60000);
        const succeeded = index % 5 !== 0;
        return {
            id: 'run_perf_' + suffix + '_' + index,
            workflowId: workflow.id,
            userId: user.id,
            status: succeeded ? 'succeeded' : 'failed',
            trigger: index % 2 === 0 ? 'webhook' : 'form-submission',
            state: {}, tags: [], steps: [], output: null,
            error: succeeded ? null : 'Benchmark failure for substring search',
            durationMs: index % 2000,
            completedAt, metricsRecordedAt: completedAt, createdAt: completedAt, updatedAt: completedAt
        };
    });
    await AutomationRun.bulkCreate(rows, { validate: false });
    const days = new Map();
    for (const row of rows) {
        const day = row.completedAt.toISOString().slice(0, 10);
        const metric = days.get(day) || { userId: user.id, day, totalRuns: 0, successRuns: 0, completedRuns: 0 };
        metric.totalRuns += 1; metric.completedRuns += 1;
        if (row.status === 'succeeded') metric.successRuns += 1;
        days.set(day, metric);
    }
    await DashboardRunMetric.bulkCreate([...days.values()]);
    const [plan] = await sequelize.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id, status, "createdAt" FROM automation_runs WHERE "userId" = :userId AND status = \'succeeded\' ORDER BY "createdAt" DESC, id DESC LIMIT 11', { replacements: { userId: user.id } });
    console.log(JSON.stringify({ benchmarkUserId: user.id, workflowId: workflow.id, runCount, seedMs: Math.round(performance.now() - startedAt), queryPlan: plan[0]['QUERY PLAN'] }, null, 2));
    console.log('Benchmark records are retained under the isolated benchmark user. Remove that user manually when finished.');
    await sequelize.close();
}
