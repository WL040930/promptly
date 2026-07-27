import React, { Suspense, useEffect, useRef } from 'react';
import { useWorkflow } from '../api/hooks/useWorkflows.js';
import { navigateTo } from '../utils/router.js';
import { useCreateWorkflow } from '../api/hooks/useWorkflows.js';

const DashboardTab = React.lazy(() => import('../builder/components/tabs/DashboardTab.jsx'));
const FormsTab = React.lazy(() => import('../builder/components/tabs/FormsTab.jsx'));
const AutomationCenter = React.lazy(() => import('../chat/components/AutomationCenter.jsx'));
const ChatTab = React.lazy(() => import('../chat/components/ChatTab.jsx'));
const WorkflowBuilderView = React.lazy(() => import('../builder/WorkflowBuilderView.jsx'));
const WorkflowAIAssistant = React.lazy(() => import('../builder/components/sidebars/WorkflowAIAssistant.jsx'));
const AutomationVersionsPage = React.lazy(() => import('./AutomationVersionsPage.jsx'));
const AutomationSettingsPage = React.lazy(() => import('./AutomationSettingsPage.jsx'));
const ApprovalsPage = React.lazy(() => import('./ApprovalsPage.jsx'));
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
    let page;
    switch (route.page) {
        case 'home':
            page = <PageFrame><DashboardTab /></PageFrame>;
            break;
        case 'automations':
            page = <PageFrame><AutomationCenter /></PageFrame>;
            break;
        case 'automation-new':
            page = <NewAutomationPage method={route.method} />;
            break;
        case 'automation-detail':
            page = <AutomationDetailPage automationId={route.automationId} />;
            break;
        case 'automation-build':
            page = route.editor === 'ai'
                ? <WorkflowAIEditorPage automationId={route.automationId} />
                : <PageFrame><WorkflowBuilderView route={route} isSidebarCollapsed={isSidebarCollapsed} setSidebarCollapsed={setSidebarCollapsed} /></PageFrame>;
            break;
        case 'automation-runs':
            page = <PageFrame><LogsTab workflowId={route.automationId} /></PageFrame>;
            break;
        case 'automation-versions':
            page = <PageFrame><AutomationVersionsPage automationId={route.automationId} /></PageFrame>;
            break;
        case 'automation-settings':
            page = <PageFrame><AutomationSettingsPage automationId={route.automationId} /></PageFrame>;
            break;
        case 'forms':
            page = <PageFrame><FormsTab /></PageFrame>;
            break;
        case 'form-detail':
            page = <PageFrame><FormsTab formId={route.formId} section={route.section} /></PageFrame>;
            break;
        case 'runs':
        case 'run-detail':
            page = <PageFrame><LogsTab runId={route.runId} /></PageFrame>;
            break;
        case 'approvals':
            page = <PageFrame><ApprovalsPage /></PageFrame>;
            break;
        case 'assistant':
            page = <PageFrame><ChatTab conversationId={route.conversationId} /></PageFrame>;
            break;
        default:
            page = <PageFrame><DashboardTab /></PageFrame>;
    }
    return <Suspense fallback={<PageFrame><div className="p-8 text-sm text-slate-500">Loading workspace…</div></PageFrame>}>{page}</Suspense>;
}
