import React from 'react';
import DashboardTab from './components/DashboardTab';
import ChatTab from './components/ChatTab';
import WorkflowTab from './components/WorkflowTab';
import LogsTab from './components/LogsTab';

const ChatView = ({ user, activeTab = 'chat' }) => {
    const renderActiveTab = () => {
        switch (activeTab) {
            case 'dashboard':
                return <DashboardTab />;
            case 'workflow':
                return <WorkflowTab />;
            case 'logs':
                return <LogsTab />;
            case 'chat':
            default:
                return <ChatTab />;
        }
    };

    return (
        <section className="flex w-full h-full bg-white relative font-sans overflow-hidden">
            {/* Right Main Content Area dynamically rendering the selected tab */}
            <div className="flex-1 flex flex-col h-full bg-white relative">
                {renderActiveTab()}
            </div>
        </section>
    );
};

export default ChatView;
