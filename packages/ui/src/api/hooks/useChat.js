import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteChatSession, getChatSession, getChatSessions, sendChatMessage } from '../backend.js';

const CHAT_SESSIONS_KEY = ['chatSessions'];

export function useChatSessions() {
    return useQuery({
        queryKey: CHAT_SESSIONS_KEY,
        queryFn: getChatSessions
    });
}

export function useChatSession(sessionId) {
    return useQuery({
        queryKey: ['chatSessions', sessionId],
        queryFn: () => getChatSession(sessionId),
        enabled: Boolean(sessionId),
        retry: false
    });
}

export function useSendChatMessage() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ sessionId, message, context, event }) =>
            sendChatMessage(sessionId, message, context, event),
        onSuccess: (response) => {
            if (response?.sessionId) {
                queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_KEY });
            }
        }
    });
}

export function useDeleteChatSession() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: deleteChatSession,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_KEY });
        }
    });
}
