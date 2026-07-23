import React, { Suspense, useEffect, useRef } from 'react';
import DashboardTab from '../builder/components/tabs/DashboardTab.jsx';
import FormsTab from '../builder/components/tabs/FormsTab.jsx';
import AutomationCenter from '../chat/components/AutomationCenter.jsx';
import ChatTab from '../chat/components/ChatTab.jsx';
import WorkflowBuilderView from '../builder/WorkflowBuilderView.jsx';
import WorkflowAIAssistant from '../builder/components/sidebars/WorkflowAIAssistant.jsx';
import { useWorkflow } from '../api/hooks/useWorkflows.js';
import { navigateTo } from '../utils/router.js';
import { useCreateWorkflow } from '../api/hooks/useWorkflows.js';
import AutomationVersionsPage from './AutomationVersionsPage.jsx';
import AutomationSettingsPage from './AutomationSettingsPage.jsx';
import ApprovalsPage from './ApprovalsPage.jsx';

const LogsTab = React.lazy(() => import('../chat/components/LogsTab.jsx'));

function PageFrame({ children }) {
    return <section className="flex min-h-0 h-full w-full flex-col overflow-hidden bg-[#f5f6fb]">{children}</section>;
}

function AutomationDetailPage({ automationId }) {
    return (
        <PageFrame>
            <div className="surface-grid flex min-h-0 flex-1 items-center justify-center p-6">
                <div className="workspace-surface max-w-xl rounded-[1.75rem] p-8 text-center">
                    <p className="eyebrow">Automation</p>
                    <h1 className="mt-2 font-display text-2xl font-bold text-slate-900">Choose how you want to build</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-500">Both editors work on the same automation. You can switch at any time without creating a copy.</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <button type="button" onClick={() => navigateTo({ page: 'automation-build', automationId, editor: 'ai' })} className="rounded-xl bg-[#5b4ee8] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_18px_rgba(91,78,232,0.18)] hover:bg-[#4e42d0]">Open AI editor</button>
                        <button type="button" onClick={() => navigateTo({ page: 'automation-build', automationId, editor: 'visual' })} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Open visual editor</button>
                    </div>
                    <div className="mt-6 flex justify-center gap-5 text-xs font-bold text-indigo-600"><button type="button" onClick={() => navigateTo({ page: 'automation-runs', automationId })}>Runs</button><button type="button" onClick={() => navigateTo({ page: 'automation-versions', automationId })}>Versions</button><button type="button" onClick={() => navigateTo({ page: 'automation-settings', automationId })}>Settings</button></div>
                </div>
            </div>
        </PageFrame>
    );
}

function WorkflowAIEditorPage({ automationId }) {
    const { data: workflow, isPending } = useWorkflow(automationId);
    const initialPrompt = new URLSearchParams(window.location.search).get('prompt') || '';
    if (isPending && !workflow) return <PageFrame><div className="flex h-full items-center justify-center text-sm text-slate-500">Loading workflow assistant…</div></PageFrame>;
    return <PageFrame><WorkflowAIAssistant workflow={workflow} initialPrompt={initialPrompt} /></PageFrame>;
}

function NewAutomationPage({ method = 'ai' }) {
    const createAutomationMutation = useCreateWorkflow();
    const started = useRef(false);
    useEffect(() => {
        if (method !== 'visual' || started.current) return;
        started.current = true;
        createAutomationMutation.mutate({ name: 'Untitled automation', lifecycleStatus: 'draft', status: 'Draft', isActive: false, nodes: [], edges: [] }, {
            onSuccess: automation => navigateTo({ page: 'automation-build', automationId: automation.id, editor: 'visual' })
        });
    }, [method]);
    if (method === 'visual') return <PageFrame><div className="flex h-full items-center justify-center text-sm text-slate-500">Preparing the visual editor…</div></PageFrame>;
    return <PageFrame><ChatTab startNewAutomation method={method} /></PageFrame>;
}

export default function WorkspacePageRouter({ route, isSidebarCollapsed, setSidebarCollapsed }) {
    switch (route.page) {
        case 'home':
            return <PageFrame><DashboardTab /></PageFrame>;
        case 'automations':
            return <PageFrame><AutomationCenter /></PageFrame>;
        case 'automation-new':
            return <NewAutomationPage method={route.method} />;
        case 'automation-detail':
            return <AutomationDetailPage automationId={route.automationId} />;
        case 'automation-build':
            return route.editor === 'ai'
                ? <WorkflowAIEditorPage automationId={route.automationId} />
                : <PageFrame><WorkflowBuilderView route={route} isSidebarCollapsed={isSidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} /></PageFrame>;
        case 'automation-runs':
            return <PageFrame><Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading runs…</div>}><LogsTab workflowId={route.automationId} /></Suspense></PageFrame>;
        case 'automation-versions':
            return <PageFrame><AutomationVersionsPage automationId={route.automationId} /></PageFrame>;
        case 'automation-settings':
            return <PageFrame><AutomationSettingsPage automationId={route.automationId} /></PageFrame>;
        case 'forms':
            return <PageFrame><FormsTab /></PageFrame>;
        case 'form-detail':
            return <PageFrame><FormsTab formId={route.formId} section={route.section} /></PageFrame>;
        case 'runs':
        case 'run-detail':
            return <PageFrame><Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading runs…</div>}><LogsTab runId={route.runId} /></Suspense></PageFrame>;
        case 'approvals':
            return <PageFrame><ApprovalsPage /></PageFrame>;
        case 'assistant':
            return <PageFrame><ChatTab conversationId={route.conversationId} /></PageFrame>;
        default:
            return <PageFrame><DashboardTab /></PageFrame>;
    }
}
