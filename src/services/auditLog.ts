// Shared in-memory audit log — written to by AdminShell and StaffShell
export interface AuditEntry {
    timestamp: string;
    actor: string;
    action: string;
    target: string;
    before?: string;
    after?: string;
}

const auditLog: AuditEntry[] = [];

export function logAction(actor: string, action: string, target: string, before?: string, after?: string): void {
    auditLog.unshift({ timestamp: new Date().toISOString(), actor, action, target, before, after });
}

export function getAuditLog(): AuditEntry[] {
    return auditLog;
}
