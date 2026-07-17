import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { approveAgentRun, deleteChatSession, getChatSession, getChatSessions, rejectAgentRun, sendChatMessage } from '../backend.js';

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

export function useApproveAgentRun() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ runId, idempotencyKey }) => approveAgentRun(runId, idempotencyKey),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_KEY });
            queryClient.invalidateQueries({ queryKey: ['forms'] });
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        }
    });
}

export function useRejectAgentRun() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: rejectAgentRun,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_KEY })
    });
}
