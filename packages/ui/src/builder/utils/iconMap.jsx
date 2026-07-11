import React from 'react';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle.mjs';
import Calendar from 'lucide-react/dist/esm/icons/calendar.mjs';
import CheckCircle from 'lucide-react/dist/esm/icons/circle-check.mjs';
import Circle from 'lucide-react/dist/esm/icons/circle.mjs';
import Clock from 'lucide-react/dist/esm/icons/clock.mjs';
import Code from 'lucide-react/dist/esm/icons/code.mjs';
import Database from 'lucide-react/dist/esm/icons/database.mjs';
import FileJson from 'lucide-react/dist/esm/icons/file-json.mjs';
import FileOutput from 'lucide-react/dist/esm/icons/file-output.mjs';
import FileText from 'lucide-react/dist/esm/icons/file-text.mjs';
import GitBranch from 'lucide-react/dist/esm/icons/git-branch.mjs';
import GitMerge from 'lucide-react/dist/esm/icons/git-merge.mjs';
import Globe from 'lucide-react/dist/esm/icons/globe.mjs';
import Image from 'lucide-react/dist/esm/icons/image.mjs';
import List from 'lucide-react/dist/esm/icons/list.mjs';
import Mail from 'lucide-react/dist/esm/icons/mail.mjs';
import MessageSquare from 'lucide-react/dist/esm/icons/message-square.mjs';
import Mic from 'lucide-react/dist/esm/icons/mic.mjs';
import Replace from 'lucide-react/dist/esm/icons/replace.mjs';
import Search from 'lucide-react/dist/esm/icons/search.mjs';
import Shield from 'lucide-react/dist/esm/icons/shield.mjs';
import ShieldAlert from 'lucide-react/dist/esm/icons/shield-alert.mjs';
import Smile from 'lucide-react/dist/esm/icons/smile.mjs';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.mjs';
import Square from 'lucide-react/dist/esm/icons/square.mjs';
import Type from 'lucide-react/dist/esm/icons/type.mjs';
import Variable from 'lucide-react/dist/esm/icons/variable.mjs';
import Webhook from 'lucide-react/dist/esm/icons/webhook.mjs';
import Zap from 'lucide-react/dist/esm/icons/zap.mjs';

const ICON_COMPONENTS = {
    'alert-circle': AlertCircle,
    categorize: List,
    clock: Clock,
    code: Code,
    condition: Shield,
    database: Database,
    date: Calendar,
    default: Circle,
    delay: Calendar,
    email: Mail,
    extract: FileOutput,
    'file-output': FileOutput,
    form: Calendar,
    generate: MessageSquare,
    http: Globe,
    image: Image,
    json: FileJson,
    loop: GitBranch,
    math: Square,
    merge: GitMerge,
    message: MessageSquare,
    rag: Search,
    sentiment: Smile,
    'shield-alert': ShieldAlert,
    sheets: FileText,
    sparkles: Sparkles,
    summarize: List,
    switch: GitBranch,
    text: Type,
    transcribe: Mic,
    transform: Replace,
    variable: Variable,
    webhook: Webhook,
    zap: Zap,
    check: CheckCircle,
};

export const ICON_MAP = Object.fromEntries(
    Object.entries(ICON_COMPONENTS).map(([name, Icon]) => [
        name,
        <Icon width="12" height="12" strokeWidth="3" className="shrink-0" />,
    ])
);

export const getIconByName = (iconName = 'default', options = {}) => {
    const {
        size = 12,
        strokeWidth = 3,
        className = 'shrink-0',
    } = options;

    const Icon = ICON_COMPONENTS[iconName] || ICON_COMPONENTS.default;
    return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
};

export const resolveNodeUi = (node = {}, fallback = {}) => ({
    icon: node.icon || fallback.icon || 'default',
    bgColor: node.bgColor || node.iconBg || fallback.bgColor || fallback.iconBg || 'bg-slate-100',
    color: node.color || node.iconColor || fallback.color || fallback.iconColor || 'text-slate-500',
});
