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
        />
    );
};

export default AINode;
