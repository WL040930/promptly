import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    changePassword,
    completeOnboarding,
    disconnectGoogle,
    getGoogleConnectUrl
} from '../auth.js';

const ME_QUERY_KEY = ['me'];

function useUpdateCurrentUser(mutationFn) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn,
        onSuccess: (response) => {
            if (response?.user) {
                queryClient.setQueryData(ME_QUERY_KEY, response.user);
            } else {
                queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
            }
        }
    });
}

export function useCompleteOnboarding() {
    return useUpdateCurrentUser(completeOnboarding);
}

export function useChangePassword() {
    return useMutation({ mutationFn: changePassword });
}

export function useDisconnectGoogle() {
    return useUpdateCurrentUser(disconnectGoogle);
}

export function useGoogleConnect() {
    return useMutation({ mutationFn: getGoogleConnectUrl });
}
