import test from 'node:test';
import assert from 'node:assert/strict';
import { isIndexableSitePath, pageMetadataForPath, robotsDirectiveForPath, sitemapPaths } from './siteSeo.js';

test('only intentional marketing routes are indexable', () => {
    assert.equal(isIndexableSitePath('/'), true);
    assert.equal(isIndexableSitePath('/security/'), true);
    assert.equal(isIndexableSitePath('/app/home'), false);
    assert.equal(isIndexableSitePath('/f/public-form'), false);
    assert.deepEqual(sitemapPaths(), ['/', '/security']);
});

test('private and public form routes receive noindex directives', () => {
    assert.equal(robotsDirectiveForPath('/app/automations'), 'noindex, nofollow');
    assert.equal(robotsDirectiveForPath('/f/public-form'), 'noindex, nofollow');
    assert.equal(pageMetadataForPath('/security').title, 'Security | Promptly');
});
