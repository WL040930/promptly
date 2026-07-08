import React from 'react';
import { MODAL_TYPES } from '../constants.js';
import { formatLastEdited } from '../../utils/timeUtils.js';
import { ICON_MAP } from '../../utils/iconMap.jsx';
import Switch from '../../../components/Switch';

/**
 * A single draggable workflow row used in both the root-level list
 * (WorkflowOverview) and inside folder expansions (FolderNode).
 */
const WorkflowRow = ({
    workflow,
    dragInfo,
    currentTime,
    openModal,
    onDragStart,
    onDragEnd,
    onSelectWorkflow,
    onToggleActive,
    folderName,
    style
}) => {
    const isDragging = dragInfo.type === 'WORKFLOW' && dragInfo.id === workflow.id;

    return (
        <div
            style={style}
            onClick={() => onSelectWorkflow?.(workflow.id, workflow.name, folderName)}
            className={`flex items-center gap-2.5 px-2 py-1.5 bg-white hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors group relative border border-transparent hover:border-indigo-100 ${isDragging ? 'opacity-50 !border-dashed !border-indigo-300' : ''}`}
        >
            {/* Drag handle */}
            <div
                draggable
                onDragStart={(event) => onDragStart(event, 'WORKFLOW', workflow.id)}
                onDragEnd={onDragEnd}
                className="absolute left-1 opacity-0 group-hover:opacity-100 text-slate-400 cursor-grab active:cursor-grabbing transition-opacity"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="19" r="1"></circle>
                    <circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="19" r="1"></circle>
                </svg>
            </div>

            {/* Workflow icon */}
            <div className={`w-7 h-7 rounded-lg ${workflow.iconBg || 'bg-indigo-100'} ${workflow.iconColor || 'text-indigo-600'} flex items-center justify-center shrink-0 ml-5`}>
                {ICON_MAP[workflow.icon] || ICON_MAP.default}
            </div>

            {/* Name and metadata */}
            <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 transition-colors leading-tight truncate">
                    {workflow.name}
                </span>
                <span className="text-[11px] font-medium text-slate-500 leading-tight mt-0.5 flex items-center gap-1.5">
                    {workflow.isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]"></span>}
                    <span className="uppercase tracking-wide font-bold">{workflow.status || 'Saved'}</span>
                    <span>•</span>
                    <span>Updated {formatLastEdited(workflow.updatedAt || workflow.createdAt, currentTime)}</span>
                </span>
            </div>

            {/* Actions: toggle active, edit, delete */}
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-1.5 shrink-0 bg-indigo-50 z-10 px-1.5 rounded">
                <Switch
                    size="sm"
                    checked={workflow.isActive}
                    onChange={(val) => onToggleActive?.(workflow.id, val)}
                    title={workflow.isActive ? 'Deactivate' : 'Activate'}
                    className="mt-0.5"
                />
                <div className="w-px h-4 bg-slate-200 mx-0.5"></div>
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        openModal(MODAL_TYPES.EDIT_WORKFLOW_PROPERTIES, { 
                            workflowId: workflow.id, 
                            currentName: workflow.name,
                            icon: workflow.icon || 'default',
                            iconColor: workflow.iconColor || 'text-indigo-600',
                            iconBg: workflow.iconBg || 'bg-indigo-100'
                        });
                    }}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all"
                    title="Edit workflow properties"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                    </svg>
                </button>
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        openModal(MODAL_TYPES.DELETE_WORKFLOW, { workflowId: workflow.id });
                    }}
                    className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-200 transition-all"
                    title="Delete workflow"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default WorkflowRow;
