import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('runtime image includes shared modules required by the CLI', async () => {
    const dockerfile = await readFile(new URL('../../../Dockerfile', import.meta.url), 'utf8');

    assert.match(
        dockerfile,
        /^COPY --from=build \/app\/packages\/shared \.\/packages\/shared$/m,
        'the runtime stage must include packages/shared for CLI imports'
    );
});
