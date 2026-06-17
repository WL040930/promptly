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
        />
    );
};

export default TriggerNode;
