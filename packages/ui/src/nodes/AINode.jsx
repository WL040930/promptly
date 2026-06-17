import React from 'react';
import BaseNode from './BaseNode';

const AINode = ({ data, isConnectable }) => {
    const { title, description, isActive, onClick } = data;
    return (
        <BaseNode
            type="ai"
            title={title}
            description={description}
            isActive={isActive}
            onClick={onClick}
            isConnectable={isConnectable}
            showInputHandle={true}
            showOutputHandle={true}
        >
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-semibold select-none">
                <span>Model Engine</span>
                <span className="bg-indigo-500/10 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-500/10 font-bold uppercase tracking-wider text-[8.5px]">gemini-1.5-pro</span>
            </div>
        </BaseNode>
    );
};

export default AINode;
