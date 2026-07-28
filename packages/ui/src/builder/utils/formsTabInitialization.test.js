import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('FormsTab initializes activeFormId before using it in the detail query', async () => {
    const file = fileURLToPath(new URL('../components/tabs/FormsTab.jsx', import.meta.url));
    const source = await readFile(file, 'utf8');

    assert.ok(source.indexOf('const [activeFormId, setActiveFormId]') < source.indexOf('useForm(activeFormId)'));
});
