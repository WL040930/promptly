import test from 'node:test';
import assert from 'node:assert/strict';

// Keep these contract tests focused on explicit stage limits; the local .env
// enables provider-managed completion for interactive development.
process.env.AI_FORM_UNLIMITED_COMPLETION_TOKENS = 'false';
process.env.AI_TIMEOUT_MS = '50';

test('generateFormFromPrompt returns a non-mutating conversational reply', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    let calls = 0;
    const provider = {
        async generateContent() {
            calls += 1;
            return {
                text: JSON.stringify({
                    type: 'reply',
                    message: 'A dropdown is best when respondents choose one value from a known list.'
                })
            };
        }
    };

    const result = await generateFormFromPrompt(
        'Why should I use a dropdown for this field?',
        { title: 'Survey', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'reply');
    assert.match(result.message, /dropdown/);
    assert.equal(calls, 1);
    assert.equal(result.tokenUsage.requestCalls, 1);
});

test('decide_everything resolves a section-heading clarification and rejects unrelated field scope', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'message',
            message: 'Which heading text should I use?',
            inputs: [{ id: 'heading', type: 'text', label: 'Section heading text' }]
        },
        {
            type: 'plan_complete',
            summary: 'Organizing the form with section headings.',
            requirements: [{ id: 'req_headings', description: 'Add section heading layout fields only.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            patches: [{
                op: 'add',
                field: { id: 'heading_contact', type: 'heading', label: 'Contact Information' },
                insertBefore: 'full_name'
            }]
        },
        { status: 'pass', issues: [] }
    ];
    const provider = {
        async generateContent() {
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'u decide',
        {
            id: 'form_1',
            title: 'Event Registration',
            description: '',
            settings: {},
            fields: [{ id: 'full_name', type: 'text', label: 'Full Name' }]
        },
        [],
        null,
        {
            provider,
            clarificationMode: 'decide_everything',
            turnContext: {
                sourceText: 'I mean section heading',
                scope: 'heading_only',
                relationToPending: 'replace',
                authority: 'assistant'
            }
        }
    );

    assert.equal(result.type, 'proposal');
    assert.deepEqual(result.schema.fields.map(field => field.type), ['heading', 'text']);
    assert.equal(result.schema.fields[0].label, 'Contact Information');
});

test('generateFormFromPrompt preserves normalized token usage from the AI client', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const provider = {
        async generateContent() {
            return {
                text: JSON.stringify({
                    type: 'reply',
                    message: 'A short answer.'
                }),
                usageMetadata: {
                    promptTokenCount: 12,
                    candidatesTokenCount: 8,
                    totalTokenCount: 20
                }
            };
        }
    };

    const result = await generateFormFromPrompt(
        'How should I collect this information?',
        { title: 'Survey', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.deepEqual(result.tokenUsage, {
        promptTokens: 12,
        completionTokens: 8,
        totalTokens: 20,
        stages: {
            planner: {
                promptTokens: 12,
                completionTokens: 8,
                totalTokens: 20,
                calls: 1
            }
        },
        requestCalls: 1
    });
});

test('generateFormFromPrompt uses the direct proposal fast path for a clear small edit', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const operations = [];
    const outputs = [
        {
            type: 'direct_proposal',
            summary: 'Making the existing email field required.',
            requirements: [{ id: 'req_1', description: 'Make the existing email field required.' }],
            patches: [{ op: 'update', id: 'email', updates: { required: true } }]
        },
        { status: 'pass', issues: [] }
    ];
    const provider = {
        async generateContent(contents, options) {
            operations.push(options.operation);
            return { text: JSON.stringify(outputs.shift()) };
        }
    };

    const result = await generateFormFromPrompt(
        'Make the existing email field required.',
        { id: 'form_1', title: 'Contact form', description: '', settings: {}, fields: [{ id: 'email', type: 'email', label: 'Email', required: false }] },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.equal(result.schema.fields[0].required, true);
    assert.deepEqual(operations, ['form:planner', 'form:verifier']);
});

test('falls back to the worker when planner repair cannot fix malformed direct-proposal fields', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const operations = [];
    const outputs = [
        {
            type: 'direct_proposal',
            summary: 'Add the requested fields.',
            requirements: [{ id: 'req_1', description: 'Add name, email, and role fields.' }],
            patches: [
                { op: 'add', field: 'name' },
                { op: 'add', field: 'email' },
                { op: 'add', field: 'role' }
            ]
        },
        {
            type: 'direct_proposal',
            summary: 'Add the requested fields.',
            requirements: [{ id: 'req_1', description: 'Add name, email, and role fields.' }],
            patches: [
                { op: 'add', field: 'name' },
                { op: 'add', field: 'email' },
                { op: 'add', field: 'role' }
            ]
        },
        {
            patches: [
                { op: 'add', field: { id: 'name', type: 'text', label: 'Name' } },
                { op: 'add', field: { id: 'email', type: 'email', label: 'Email' } },
                { op: 'add', field: { id: 'role', type: 'text', label: 'Role' } }
            ]
        },
        { status: 'pass', issues: [] }
    ];
    const provider = {
        async generateContent(contents, options) {
            operations.push(options.operation);
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Create a form with name, email, and role fields.',
        { id: 'form_1', title: 'Contact', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.deepEqual(result.schema.fields.map(field => field.id), ['name', 'email', 'role']);
    assert.deepEqual(operations, ['form:planner', 'form:planner repair', 'form:worker', 'form:verifier']);
});

test('generateFormFromPrompt repairs a semantically incorrect proposal once', async () => {
    Object.assign(process.env, {
        AI_TIMEOUT_MS: '50',
        JWT_SECRET: 'test-secret-that-is-at-least-thirty-two-characters',
        DB_HOST: 'localhost',
        DB_USER: 'test',
        DB_PASSWORD: 'test',
        DB_DATABASE: 'test',
        GOOGLE_CLIENT_ID: 'test',
        GOOGLE_CLIENT_SECRET: 'test',
        GOOGLE_REDIRECT_URI: 'http://localhost/callback',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '25',
        SMTP_USER: 'test',
        SMTP_PASS: 'test',
        SMTP_FROM: 'test@example.com',
        SUPABASE_URL: 'http://localhost',
        SUPABASE_ANON_KEY: 'test'
    });

    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Making the email required.',
            requirements: [{ id: 'req_1', description: 'Make the existing email field required.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            type: 'proposal',
            message: 'Updated the email field.',
            patches: [{ op: 'update', id: 'email', updates: { required: false } }]
        },
        {
            status: 'repair',
            issues: [{ requirementId: 'req_1', message: 'The email field is still optional.' }]
        },
        {
            type: 'proposal',
            message: 'Updated the email field.',
            patches: [{ op: 'update', id: 'email', updates: { required: true } }]
        },
        {
            status: 'pass',
            issues: []
        }
    ];
    const progress = [];
    const requestOptions = [];
    const provider = {
        async generateContent(contents, options) {
            requestOptions.push(options);
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Make the email required.',
        {
            id: 'form_1',
            title: 'Contact form',
            description: '',
            settings: {},
            fields: [{ id: 'email', type: 'email', label: 'Email', required: false }]
        },
        [],
        event => progress.push(event.status),
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.equal(result.schema.fields[0].required, true);
    assert.equal(result.verification.status, 'pass');
    assert.deepEqual(result.verification.fulfilledRequirements, ['req_1']);
    assert.equal(outputs.length, 0);
    assert.ok(progress.includes('repairing'));
    assert.deepEqual(requestOptions.map(options => options.maxCompletionTokens), [1800, 3072, 768, 3072, 768]);
    assert.equal(result.tokenUsage.stages.planner.calls, 1);
    assert.equal(result.tokenUsage.stages.worker.calls, 1);
    assert.equal(result.tokenUsage.stages['worker repair'].calls, 1);
    assert.equal(result.tokenUsage.stages.verifier.calls, 2);
});

test('generateFormFromPrompt treats an explicit total question count as the final count', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Building a three-question form.',
            requirements: [{ id: 'req_1', description: 'Create a form with a total of 3 questions.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            type: 'proposal',
            message: 'Added the requested questions.',
            patches: [
                { op: 'add', field: { id: 'f_q1', type: 'text', label: 'Question 1' } },
                { op: 'add', field: { id: 'f_q2', type: 'text', label: 'Question 2' } },
                { op: 'add', field: { id: 'f_q3', type: 'text', label: 'Question 3' } }
            ]
        },
        {
            type: 'proposal',
            message: 'Adjusted the form to three total questions.',
            patches: [
                { op: 'add', field: { id: 'f_q1', type: 'text', label: 'Question 1' } },
                { op: 'add', field: { id: 'f_q2', type: 'text', label: 'Question 2' } }
            ]
        },
        { status: 'pass', issues: [] }
    ];
    const provider = {
        async generateContent() {
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Create a form with a total of 3 questions.',
        {
            id: 'form_1',
            title: 'Existing form',
            description: '',
            settings: {},
            fields: [{ id: 'existing', type: 'text', label: 'Existing question' }]
        },
        [],
        null,
        { provider }
    );

    assert.equal(result.schema.fields.length, 3);
    assert.deepEqual(result.cardinality, {
        mode: 'total_questions',
        targetCount: 3,
        currentCount: 1,
        additionalCount: 2
    });
    assert.equal(result.verification.status, 'pass');
    assert.equal(outputs.length, 0);
});

test('recovers user-facing labels when the worker and its repair omit them', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Building the registration form.',
            requirements: [{ id: 'req_1', description: 'Add first name, email, and attendance type fields.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            type: 'proposal',
            message: 'Built the registration form.',
            patches: [
                { op: 'add', field: { id: 'f_first_name', type: 'text', required: true } },
                { op: 'add', field: { id: 'f_email', type: 'email', required: true } },
                { op: 'add', field: { id: 'f_attendance_type', type: 'select', choices: ['In-person', 'Virtual'] } }
            ]
        },
        {
            type: 'proposal',
            message: 'Built the registration form.',
            patches: [
                { op: 'add', field: { id: 'f_first_name', type: 'text', required: true } },
                { op: 'add', field: { id: 'f_email', type: 'email', required: true } },
                { op: 'add', field: { id: 'f_attendance_type', type: 'select', choices: ['In-person', 'Virtual'] } }
            ]
        },
        {
            type: 'proposal',
            message: 'Built the registration form.',
            patches: [
                { op: 'update_meta', updates: { title: 'Event Registration', description: '' } },
                { op: 'add', field: { id: 'f_first_name', type: 'text', label: 'First Name', required: true } },
                { op: 'add', field: { id: 'f_email', type: 'email', label: 'Email', required: true } },
                { op: 'add', field: { id: 'f_attendance_type', type: 'select', label: 'Attendance Type', choices: ['In-person', 'Virtual'] } }
            ]
        },
        { status: 'pass', issues: [] }
    ];
    const provider = {
        async generateContent() {
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Create an event registration form.',
        { id: 'form_1', title: '', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.deepEqual(result.schema.fields.map(field => field.label), ['First Name', 'Email', 'Attendance Type']);
    assert.equal(result.verification.status, 'pass');
});

test('generateFormFromPrompt fails instead of hanging when a model stage never resolves', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const plannerResponse = {
        type: 'plan_complete',
        summary: 'Building the form.',
        requirements: [{ id: 'req_1', description: 'Add a required email field.' }],
        memoryUpdate: { action: 'none' }
    };
    let calls = 0;
    const provider = {
        async generateContent() {
            calls += 1;
            if (calls === 1) return { text: JSON.stringify(plannerResponse) };
            return new Promise(() => {});
        }
    };

    const form = {
        id: 'form_1',
        title: 'Contact form',
        description: '',
        settings: {},
        fields: []
    };

    const outcome = await Promise.race([
        generateFormFromPrompt('Add an email field.', form, [], null, { provider })
            .then(() => ({ type: 'resolved' }))
            .catch(error => ({ type: 'rejected', error })),
        new Promise(resolve => setTimeout(() => resolve({ type: 'hung' }), 150))
    ]);

    assert.equal(outcome.type, 'rejected');
    assert.equal(outcome.error.code, 'FORM_AI_PROVIDER_TIMEOUT');
});

test('generateFormFromPrompt exposes a retryable rate-limit error', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const provider = {
        async generateContent() {
            const error = new Error('Tokens per minute limit exceeded.');
            error.status = 429;
            error.headers = { 'retry-after': '60' };
            throw error;
        }
    };

    await assert.rejects(
        generateFormFromPrompt('Add an email field.', { fields: [], settings: {} }, [], null, { provider }),
        error => {
            assert.equal(error.code, 'FORM_AI_RATE_LIMITED');
            assert.match(error.message, /60 seconds/);
            return true;
        }
    );
});

test('generateFormFromPrompt normalizes provider deadline errors', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const provider = {
        async generateContent() {
            const error = new Error('Deadline expired before operation could complete.');
            error.status = 504;
            throw error;
        }
    };

    await assert.rejects(
        generateFormFromPrompt('Add an email field.', { fields: [], settings: {} }, [], null, { provider }),
        error => {
            assert.equal(error.code, 'FORM_AI_PROVIDER_TIMEOUT');
            assert.equal(error.issues?.[0]?.code, 'PROVIDER_TIMEOUT');
            assert.match(error.issues?.[0]?.message || '', /Deadline expired/);
            return true;
        }
    );
});

test('generateFormFromPrompt normalizes temporary provider outages', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const provider = {
        async generateContent() {
            const error = new Error('This model is currently experiencing high demand.');
            error.status = 503;
            error.code = 'UNAVAILABLE';
            throw error;
        }
    };

    await assert.rejects(
        generateFormFromPrompt('Add an email field.', { fields: [], settings: {} }, [], null, { provider }),
        error => {
            assert.equal(error.code, 'FORM_AI_PROVIDER_UNAVAILABLE');
            assert.equal(error.issues?.[0]?.code, 'PROVIDER_UNAVAILABLE');
            assert.match(error.message, /temporarily unavailable/);
            return true;
        }
    );
});

test('worker repair retries a malformed verifier repair response', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Building the form.',
            requirements: [{ id: 'req_1', description: 'Add a required email field.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            type: 'proposal',
            message: 'Added the email field.',
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email', required: true } }]
        },
        {
            status: 'repair',
            issues: [{ requirementId: 'req_1', message: 'The field must be required.' }]
        },
        null,
        {
            type: 'proposal',
            message: 'Added the required email field.',
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email', required: true } }]
        },
        { status: 'pass', issues: [] }
    ];
    let calls = 0;
    const provider = {
        async generateContent() {
            calls += 1;
            return { text: JSON.stringify(outputs.shift()) };
        }
    };

    const result = await generateFormFromPrompt(
        'Add a required email field.',
        { id: 'form_1', title: 'Contact', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.equal(result.schema.fields[0].required, true);
    assert.equal(calls, 6);
});

test('worker recovery returns a typed error after malformed repair responses are exhausted', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Building the form.',
            requirements: [{ id: 'req_1', description: 'Add an email field.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            type: 'proposal',
            message: 'Added the email field.',
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }]
        },
        {
            status: 'repair',
            issues: [{ requirementId: 'req_1', message: 'The field is incomplete.' }]
        },
        null,
        null,
        null,
        null
    ];
    const provider = {
        async generateContent() {
            return { text: JSON.stringify(outputs.shift()) };
        }
    };

    await assert.rejects(
        generateFormFromPrompt(
            'Add an email field.',
            { id: 'form_1', title: 'Contact', description: '', settings: {}, fields: [] },
            [],
            null,
            { provider }
        ),
        error => error.code === 'FORM_AI_INVALID_WORKER_RESPONSE'
            && error.issues?.[0]?.code === 'INVALID_WORKER_RESPONSE'
    );
});

test('verifier retries malformed JSON before failing the form proposal', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Building the form.',
            requirements: [{ id: 'req_1', description: 'Add an email field.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            type: 'proposal',
            message: 'Added the email field.',
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }]
        },
        '{"status":"pass","issues":[',
        { status: 'pass', issues: [] }
    ];
    let calls = 0;
    const provider = {
        async generateContent() {
            calls += 1;
            const output = outputs.shift();
            return { text: typeof output === 'string' ? output : JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Add an email field.',
        { id: 'form_1', title: 'Contact', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.equal(result.verification.status, 'pass');
    assert.equal(calls, 4);
});

test('returns an unverified proposal when verifier repair returns no JSON', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Add an email field.',
            requirements: [{ id: 'req_1', description: 'Add an email field.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }]
        },
        '{"status":"repair","issues":[',
        {
            text: '',
            finishReason: 'length'
        }
    ];
    const provider = {
        async generateContent() {
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return output.text !== undefined ? output : { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Add an email field.',
        { id: 'form_1', title: 'Contact', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.equal(result.schema.fields[0].label, 'Email');
    assert.equal(result.verification.status, 'unverified');
    assert.equal(result.verification.skippedReason, 'VERIFIER_RESPONSE_INVALID');
});

test('returns the latest locally valid proposal when semantic verification cannot pass', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const verificationIssue = {
        requirementId: 'req_4',
        message: 'The Number of Attendees field is required but does not specify the required minimum value of 1.'
    };
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Build the event registration form.',
            requirements: [{ id: 'req_4', description: 'Number of Attendees must be required with a minimum value of 1.' }],
            memoryUpdate: { action: 'none' }
        },
        ...Array.from({ length: 5 }, () => [
            {
                patches: [{
                    op: 'add',
                    field: { id: 'attendees', type: 'number', label: 'Number of Attendees', required: true, min: 0 }
                }]
            },
            { status: 'repair', issues: [verificationIssue] }
        ]).flat()
    ];
    const provider = {
        async generateContent() {
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Create an event registration form with the number of attendees required to be at least 1.',
        { id: 'form_1', title: 'Event Registration', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.equal(result.schema.fields[0].label, 'Number of Attendees');
    assert.equal(result.schema.fields[0].min, 0);
    assert.equal(result.verification.status, 'unverified');
    assert.deepEqual(result.verification.issues, [verificationIssue]);
});

test('allows the final verifier in the third bounded repair loop', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Make the email required.',
            requirements: [{ id: 'req_1', description: 'Make the email field required.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            patches: [{ op: 'update', id: 'email', updates: { required: false } }]
        },
        {
            status: 'repair',
            issues: [{ requirementId: 'req_1', message: 'The email field is still optional.' }]
        },
        {
            patches: [{ op: 'update', id: 'email', updates: { required: false } }]
        },
        {
            status: 'repair',
            issues: [{ requirementId: 'req_1', message: 'The email field is still optional.' }]
        },
        {
            patches: [{ op: 'update', id: 'email', updates: { required: true } }]
        },
        {
            status: 'pass',
            issues: []
        }
    ];
    const provider = {
        async generateContent() {
            const output = outputs.shift();
            assert.ok(output, 'The fake provider received an unexpected request.');
            return { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Make the email required.',
        {
            id: 'form_1',
            title: 'Contact form',
            description: '',
            settings: {},
            fields: [{ id: 'email', type: 'email', label: 'Email', required: false }]
        },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.equal(result.schema.fields[0].required, true);
    assert.equal(result.verification.status, 'pass');
    assert.equal(result.tokenUsage.requestCalls, 7);
    assert.equal(outputs.length, 0);
});

test('planner retries a response truncated by the completion limit', async () => {
    const { generateFormFromPrompt } = await import('./pipeline.js');
    const outputs = [
        {
            text: '{"type":"plan_complete","summary":"Building the form.","requirements":[{"id":"req_1","description":"Add an email field."',
            finishReason: 'length'
        },
        {
            type: 'plan_complete',
            summary: 'Building the form.',
            requirements: [{ id: 'req_1', description: 'Add an email field.' }],
            memoryUpdate: { action: 'none' }
        },
        {
            patches: [{ op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }]
        },
        { status: 'pass', issues: [] }
    ];
    const requestOptions = [];
    const provider = {
        async generateContent(contents, options) {
            requestOptions.push(options);
            const output = outputs.shift();
            return output?.text
                ? output
                : { text: JSON.stringify(output) };
        }
    };

    const result = await generateFormFromPrompt(
        'Add an email field.',
        { id: 'form_1', title: 'Contact', description: '', settings: {}, fields: [] },
        [],
        null,
        { provider }
    );

    assert.equal(result.type, 'proposal');
    assert.equal(result.schema.fields[0].label, 'Email');
    assert.deepEqual(requestOptions.map(options => options.maxCompletionTokens), [1800, 2200, 3072, 768]);
});
