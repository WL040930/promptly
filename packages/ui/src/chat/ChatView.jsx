import React, { Suspense } from 'react';
import DashboardTab from '../builder/components/tabs/DashboardTab.jsx';
import ChatTab from './components/ChatTab.jsx';
import WorkflowTab from './components/WorkflowTab.jsx';
import FormsTab from '../builder/components/tabs/FormsTab.jsx';
import LogsTabFallback from './components/log-ui/LogsSkeleton.jsx';

const LogsTab = React.lazy(() => import('./components/LogsTab.jsx'));

const ChatView = ({ user, activeTab = 'chat' }) => {
    const renderActiveTab = () => {
        switch (activeTab) {
            case 'dashboard':
                return <DashboardTab simplified={true} />;
            case 'workflow':
                return <WorkflowTab />;
            case 'forms':
                return <FormsTab />;
            case 'logs':
                return (
                    <Suspense fallback={<LogsTabFallback />}>
                        <LogsTab />
                    </Suspense>
                );
            case 'chat':
            default:
                return <ChatTab />;
        }
    };

    return (
        <section className="flex min-h-0 w-full h-full bg-white relative font-sans overflow-hidden">
            {/* Right Main Content Area dynamically rendering the selected tab */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col h-full bg-white relative overflow-hidden">
                {renderActiveTab()}
            </div>
        </section>
    );
};

export default ChatView;
