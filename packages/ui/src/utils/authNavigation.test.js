import test from 'node:test';
import assert from 'node:assert/strict';
import { getAuthRedirect } from './authNavigation.js';

const dashboardRoute = {
    isDashboard: true,
    isOnboarding: false,
    isResetPassword: false,
    isPublicForm: false
};

test('keeps a deep link while the authenticated session is loading', () => {
    assert.equal(getAuthRedirect({ user: null, isLoading: true, routeState: dashboardRoute }), null);
});

test('redirects an unauthenticated app route after auth loading completes', () => {
    assert.equal(getAuthRedirect({ user: null, isLoading: false, routeState: dashboardRoute }), '/login');
});

test('does not redirect a signed-in app route', () => {
    assert.equal(getAuthRedirect({ user: { id: 'user_1' }, isLoading: false, routeState: dashboardRoute }), null);
});
