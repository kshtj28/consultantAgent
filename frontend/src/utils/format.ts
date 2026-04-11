export function getInitials(name: string): string {
    if (!name) return '??';
    return name
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('');
}

export function getRoleLabel(role: string): string {
    if (!role) return 'User';
    switch (role.toLowerCase()) {
        case 'cxo':
        case 'executive':
            return 'Executive';
        case 'admin':
            return 'Administrator';
        case 'analyst':
            return 'Analyst';
        default:
            return role;
    }
}

export function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
