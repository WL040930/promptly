import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('./FormDiffPreviewModal.jsx', import.meta.url);

test('form preview actions stay in the modal hit layer and use the shared button contract', async () => {
    const source = await readFile(sourceUrl, 'utf8');

    assert.match(source, /import Button from ['"]\.\.\/\.\.\/components\/ui\/Button\.jsx['"]/);
    assert.match(source, /className="relative z-10 bg-slate-50/);
    assert.match(source, /<Button[\s\S]*onClick=\{onApply\}[\s\S]*isLoading=\{isApplying\}/);
});
