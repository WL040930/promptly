import test from 'node:test';
import assert from 'node:assert/strict';

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

    const { generateFormFromPrompt } = await import('./aiFormsService.js');
    const outputs = [
        {
            type: 'plan_complete',
            summary: 'Making the email required.',
            requirements: [{ id: 'req_1', description: 'Make the existing email field required.' }],
            instructionsForWorker: 'Update the existing email field so required is true.',
            memoryUpdate: { action: 'none' }
        },
        {
            type: 'proposal',
            message: 'Updated the email field.',
            patches: [{ op: 'update', id: 'email', updates: { required: false } }]
        },
        {
            status: 'repair',
            fulfilledRequirements: [],
            issues: [{ requirementId: 'req_1', message: 'The email field is still optional.' }]
        },
        {
            type: 'proposal',
            message: 'Updated the email field.',
            patches: [{ op: 'update', id: 'email', updates: { required: true } }]
        },
        {
            status: 'pass',
            fulfilledRequirements: ['req_1'],
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
    assert.equal(outputs.length, 0);
    assert.ok(progress.includes('repairing'));
    assert.deepEqual(requestOptions.map(options => options.maxCompletionTokens), [800, 2048, 600, 2048, 600]);
});

test('generateFormFromPrompt fails instead of hanging when a model stage never resolves', async () => {
    const { generateFormFromPrompt } = await import('./aiFormsService.js');
    const plannerResponse = {
        type: 'plan_complete',
        summary: 'Building the form.',
        requirements: [{ id: 'req_1', description: 'Add a required email field.' }],
        instructionsForWorker: 'Add a required email field.',
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
    const { generateFormFromPrompt } = await import('./aiFormsService.js');
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
