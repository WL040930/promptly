import asyncHandler from '../../utils/asyncHandler.js';
import { AutomationRun, Form, Workflow } from '../../models/index.js';
import { demoKeyForScope, ONBOARDING_DEMO_KEY, workspaceWhere } from '../../utils/workspaceScope.js';
import { deleteDemoWorkspace, ensureDemoWorkspace, resetDemoWorkspace } from '../../services/onboarding/onboardingDemoService.js';

const serializeDemo = demo => ({
    ...demo,
    tutorialVersion: 3
});

export const getOnboardingContext = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const [workflows, forms, runs, demoWorkflows, demoForms, demoRuns] = await Promise.all([
        Workflow.count({ where: workspaceWhere({ userId, scope: 'live' }) }),
        Form.count({ where: workspaceWhere({ userId, scope: 'live' }) }),
        AutomationRun.count({ where: workspaceWhere({ userId, scope: 'live' }) }),
        Workflow.count({ where: workspaceWhere({ userId, scope: 'demo' }) }),
        Form.count({ where: workspaceWhere({ userId, scope: 'demo' }) }),
        AutomationRun.count({ where: workspaceWhere({ userId, scope: 'demo' }) })
    ]);
    res.json({
        tutorialVersion: 3,
        hasRealData: workflows + forms + runs > 0,
        counts: { workflows, forms, runs },
        demo: {
            key: ONBOARDING_DEMO_KEY,
            exists: demoWorkflows + demoForms + demoRuns > 0,
            counts: { workflows: demoWorkflows, forms: demoForms, runs: demoRuns }
        },
        liveScope: demoKeyForScope('live')
    });
});

export const ensureOnboardingDemo = asyncHandler(async (req, res) => {
    const demo = await ensureDemoWorkspace(req.user.id);
    res.status(201).json(serializeDemo(demo));
});

export const resetOnboardingDemo = asyncHandler(async (req, res) => {
    const demo = await resetDemoWorkspace(req.user.id);
    res.json(serializeDemo(demo));
});

export const deleteOnboardingDemo = asyncHandler(async (req, res) => {
    const removed = await deleteDemoWorkspace(req.user.id);
    res.json({ message: 'Sample workspace removed.', removed });
});

