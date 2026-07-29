export const pageAfterDeletingItem = ({ page = 1, itemCount = 0 } = {}) => (
    page > 1 && itemCount === 1 ? page - 1 : page
);
