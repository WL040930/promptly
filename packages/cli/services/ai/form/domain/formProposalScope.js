export const validateFormProposalScope = ({ scope = 'general_form_change', patches = [] } = {}) => {
    if (scope !== 'heading_only') return [];

    const issues = [];
    patches.forEach((patch, index) => {
        const path = `patches[${index}]`;
        if (patch?.op !== 'add') {
            issues.push({
                code: 'FORM_AI_SCOPE_VIOLATION',
                path,
                message: 'A heading-only request may add headings without changing existing form content.'
            });
            return;
        }
        if (patch.field?.type !== 'heading') {
            issues.push({
                code: 'FORM_AI_SCOPE_VIOLATION',
                path: `${path}.field.type`,
                message: 'A heading-only request may add heading fields only.'
            });
        }
    });
    return issues;
};
