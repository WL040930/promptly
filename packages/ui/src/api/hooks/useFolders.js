import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFolders, createFolder, updateFolder, deleteFolder } from '../backend.js';

export const useFolders = () => {
    return useQuery({
        queryKey: ['folders'],
        queryFn: getFolders,
    });
};

export const useCreateFolder = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: createFolder,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['folders'] });
        },
    });
};

export const useUpdateFolder = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: ({ id, data }) => updateFolder(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};

export const useDeleteFolder = () => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: deleteFolder,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['folders'] });
            queryClient.invalidateQueries({ queryKey: ['workflows'] });
        },
    });
};
