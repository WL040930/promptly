import test from 'node:test';
import assert from 'node:assert/strict';

import NodeRegistry from '../cli/utils/NodeRegistry.js';
import { BaseNode } from './BaseNode.js';
import { NodeFactory } from './NodeFactory.js';

class CaptureNode extends BaseNode {}

test('createNode preserves node metadata and config argument order', () => {
    const originalGetClass = NodeRegistry.getClass;
    NodeRegistry.getClass = () => CaptureNode;

    try {
        const config = {
            emailProvider: 'system-default',
            to: 'test@example.com',
            subject: 'Test subject',
            body: 'Test body',
        };
        const position = { x: 10, y: 20 };
        const schema = { inputs: [], outputs: [] };

        const node = NodeFactory.createNode({
            id: 'email_1',
            type: 'action',
            subType: 'email',
            title: 'Send Email',
            description: 'Send a test email',
            schema,
            config,
            position,
        });

        assert.equal(node.id, 'email_1');
        assert.equal(node.type, 'action');
        assert.equal(node.subType, 'email');
        assert.equal(node.title, 'Send Email');
        assert.equal(node.description, 'Send a test email');
        assert.deepEqual(node.schema, schema);
        assert.deepEqual(node.config, config);
        assert.deepEqual(node.position, position);
    } finally {
        NodeRegistry.getClass = originalGetClass;
    }
});
