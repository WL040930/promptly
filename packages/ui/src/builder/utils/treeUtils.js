export const buildFoldersByParent = (folders) => {
    const map = new Map();
    folders.forEach((folder) => {
        const list = map.get(folder.parentId) || [];
        list.push(folder);
        map.set(folder.parentId, list);
    });
    return map;
};

export const buildWorkflowsByFolder = (workflows) => {
    const map = new Map();
    workflows.forEach((workflow) => {
        const list = map.get(workflow.folderId) || [];
        list.push(workflow);
        map.set(workflow.folderId, list);
    });
    return map;
};

export const collectDescendantIds = (folders, rootId) => {
    if (!rootId) return [];

    const byParent = buildFoldersByParent(folders);
    const ids = [];
    const stack = [rootId];

    while (stack.length > 0) {
        const currentId = stack.pop();
        if (!currentId) continue;

        ids.push(currentId);
        const children = byParent.get(currentId) || [];
        children.forEach((child) => stack.push(child.id));
    }

    return ids;
};
