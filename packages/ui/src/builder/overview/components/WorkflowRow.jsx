import React from 'react';
import { MODAL_TYPES } from '../constants.js';
import { formatLastEdited } from '../../utils/timeUtils.js';

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
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
            </div>

            {/* Name and metadata */}
            <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-slate-900 group-hover:text-indigo-700 transition-colors leading-tight truncate">
                    {workflow.name}
                </span>
                <span className="text-xs font-medium text-slate-500 leading-tight mt-0.5">
                    {workflow.status || 'Draft'} • Updated {formatLastEdited(workflow.updatedAt || workflow.createdAt, currentTime)}
                </span>
            </div>

            {/* Actions: rename, delete */}
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5 shrink-0 bg-indigo-50 z-10 px-1 rounded">
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        openModal(MODAL_TYPES.RENAME_WORKFLOW, { workflowId: workflow.id, currentName: workflow.name });
                    }}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all"
                    title="Rename workflow"
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
