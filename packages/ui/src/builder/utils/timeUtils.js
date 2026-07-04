export const formatLastEdited = (dateString, currentTime = Date.now()) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date(currentTime);
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) {
        const mins = Math.floor(diffInSeconds / 60);
        return `${mins} min${mins > 1 ? 's' : ''} ago`;
    }
    
    if (date.toDateString() === now.toDateString()) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
