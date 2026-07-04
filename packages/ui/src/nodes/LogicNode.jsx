import React from 'react';
import BaseNode from './BaseNode';

const LogicNode = ({ data, isConnectable }) => {
    const { title, description, isActive, onClick, subType, onDelete, onHandleClick } = data;
    
    let customOutputHandles = null;
    
    if (subType === 'condition') {
        customOutputHandles = [
            { id: 'true', label: 'True' },
            { id: 'false', label: 'False' }
        ];
    } else if (subType === 'switch') {
        customOutputHandles = [
            { id: 'branchA', label: 'Branch A' },
            { id: 'branchB', label: 'Branch B' },
            { id: 'default', label: 'Default' }
        ];
    }

    return (
        <BaseNode
            type="logic"
            title={title}
            description={description}
            isActive={isActive}
            onClick={onClick}
            onHandleClick={onHandleClick}
            isConnectable={isConnectable}
            onDelete={onDelete}
            showInputHandle={true}
            showOutputHandle={true}
            customOutputHandles={customOutputHandles}
        >
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-semibold select-none">
                <span>Branching</span>
                <span className="bg-blue-500/10 text-blue-700 px-2 py-0.5 rounded-full border border-blue-500/10 font-bold uppercase tracking-wider text-[8.5px]">{subType || 'Evaluation'}</span>
            </div>
        </BaseNode>
    );
};

export default LogicNode;
