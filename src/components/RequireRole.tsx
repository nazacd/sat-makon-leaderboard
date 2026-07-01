import { Navigate } from 'react-router-dom';
import { useAuth } from '@/services/AuthProvider';
import LoginPage from '@/pages/LoginPage';
import type { StaffRole } from '@shared/types';

interface RequireRoleProps {
    allowedRoles: StaffRole[];
    redirectTo?: string;
    children: React.ReactNode;
}

export default function RequireRole({ allowedRoles, redirectTo, children }: RequireRoleProps) {
    const { session } = useAuth();

    if (!session) {
        return <LoginPage />;
    }

    if (!allowedRoles.includes(session.role)) {
        if (redirectTo) {
            return <Navigate to={redirectTo} replace />;
        }
        return (
            <div className="max-w-lg mx-auto px-4 py-20 text-center animate-fade-in">
                <div className="text-5xl mb-4">🚫</div>
                <h1 className="text-2xl font-bold text-neutral-900 mb-2">Access Denied</h1>
                <p className="text-neutral-500">
                    Your account ({session.role}) does not have permission to access this page.
                </p>
            </div>
        );
    }

    return <>{children}</>;
}
