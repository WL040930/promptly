import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    MIN_PASSWORD_LENGTH,
    PASSWORD_REQUIREMENTS_ERROR,
    PASSWORD_REQUIREMENTS_HINT,
    isValidPassword
} from './passwordPolicy.js';

const authScreenUrls = [
    new URL('../ui/src/auth/RegisterPage.jsx', import.meta.url),
    new URL('../ui/src/auth/ResetPasswordPage.jsx', import.meta.url),
    new URL('../ui/src/dashboard/SettingsModal.jsx', import.meta.url)
];

test('authentication screens use the shared password requirements hint', async () => {
    for (const url of authScreenUrls) {
        const source = await readFile(url, 'utf8');

        assert.match(source, /passwordPolicy\.js/);
        assert.match(source, /PASSWORD_REQUIREMENTS_HINT/);
        assert.doesNotMatch(source, /Use at least 8 characters/);
    }
});

test('the backend validator imports the shared password policy', async () => {
    const source = await readFile(new URL('../cli/utils/validators.js', import.meta.url), 'utf8');

    assert.match(source, /passwordPolicy\.js/);
    assert.doesNotMatch(source, /const passwordPattern =/);
});

test('the shared policy enforces and explains the password rule', () => {
    assert.equal(MIN_PASSWORD_LENGTH, 12);
    assert.equal(PASSWORD_REQUIREMENTS_HINT, 'Use at least 12 characters, including an uppercase letter, a lowercase letter, a number, and a symbol.');
    assert.equal(PASSWORD_REQUIREMENTS_ERROR, 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.');

    assert.equal(isValidPassword('ValidPass1!2'), true);
    assert.equal(isValidPassword('ValidPass1!'), false);
    assert.equal(isValidPassword('validpass1!2'), false);
    assert.equal(isValidPassword('VALIDPASS1!2'), false);
    assert.equal(isValidPassword('ValidPassword!'), false);
    assert.equal(isValidPassword('ValidPassword1'), false);
});
