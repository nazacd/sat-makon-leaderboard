import type { StaffRole, Teacher } from '@/data/types';

export const canAccessAdmin = (role: StaffRole): boolean =>
    role === 'admin' || role === 'super_admin';

export const canManageStaff = (actorRole: StaffRole, targetRole: StaffRole): boolean => {
    if (targetRole === 'teacher') return actorRole === 'admin' || actorRole === 'super_admin';
    return actorRole === 'super_admin';
};

export interface ArchiveCheck {
    allowed: boolean;
    reason?: string;
}

export const canArchiveStaff = (
    actor: Teacher,
    target: Teacher,
    allTeachers: Teacher[],
): ArchiveCheck => {
    if (actor.id === target.id) {
        return { allowed: false, reason: 'You cannot archive your own account.' };
    }
    if (!canManageStaff(actor.role, target.role)) {
        return { allowed: false, reason: 'Insufficient permissions to manage this account.' };
    }
    if (target.role === 'super_admin') {
        const activeSuperAdmins = allTeachers.filter(t => t.role === 'super_admin' && !t.archived);
        if (activeSuperAdmins.length <= 1) {
            return { allowed: false, reason: 'Cannot archive the last active super_admin.' };
        }
    }
    return { allowed: true };
};
