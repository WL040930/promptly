/**
 * Decide whether the authenticated shell should move to another route.
 *
 * While the session query is pending, an absent user is not evidence that the
 * visitor is signed out. Returning null during that window keeps deep links
 * from being replaced by /login before the auth response arrives.
 */
export const getAuthRedirect = ({ user, isLoading, routeState }) => {
    if (isLoading) return null;

    if (user && !routeState.isDashboard && !routeState.isOnboarding && !routeState.isResetPassword && !routeState.isPublicForm) {
        return '/app/home';
    }

    if (!user && (routeState.isDashboard || routeState.isOnboarding)) {
        return '/login';
    }

    if (user && routeState.isOnboarding && user.onboardingCompletedAt) {
        return '/app/home';
    }

    return null;
};
