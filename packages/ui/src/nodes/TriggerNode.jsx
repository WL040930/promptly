import React from 'react';
import BaseNode from './BaseNode';

const TriggerNode = ({ data, isConnectable }) => {
    const { title, description, isActive, onClick } = data;
    return (
        <BaseNode
            type="trigger"
            title={title}
            description={description}
            isActive={isActive}
            onClick={onClick}
            isConnectable={isConnectable}
            showInputHandle={false}
            showOutputHandle={true}
        >
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-semibold select-none">
                <span>Activation Mode</span>
                <span className="bg-orange-500/10 text-orange-700 px-2 py-0.5 rounded-full border border-orange-500/10 font-bold uppercase tracking-wider text-[8.5px]">Instant</span>
            </div>
        </BaseNode>
    );
};

export default TriggerNode;
