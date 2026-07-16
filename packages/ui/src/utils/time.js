export function formatRelativeTime(dateString, currentTime = Date.now()) {
    if (!dateString) return 'Never'

    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return 'Recently'

    const now = new Date(currentTime)
    const diffInSeconds = Math.floor((now - date) / 1000)

    if (diffInSeconds < 60) return 'Just now'
    if (diffInSeconds < 3600) {
        const minutes = Math.floor(diffInSeconds / 60)
        return `${minutes} min${minutes > 1 ? 's' : ''} ago`
    }

    if (date.toDateString() === now.toDateString()) {
        return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatCompactRelativeTime(dateString, currentTime = Date.now()) {
    if (!dateString) return ''

    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return ''

    const diffInSeconds = Math.floor((currentTime - date.getTime()) / 1000)
    if (diffInSeconds < 60) return 'Just now'

    const diffInMinutes = Math.floor(diffInSeconds / 60)
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`

    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) return `${diffInHours}h ago`

    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) return `${diffInDays}d ago`

    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}
