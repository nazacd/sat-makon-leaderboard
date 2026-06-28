// ===== SAT-MAKON Router =====
// Three surfaces simulated via routes in dev.
// NOTE: Subdomain split (student.sat-makon / staff.sat-makon) is a deployment concern.
// Dev uses: / (student) · /staff (teacher) · /admin

import { createBrowserRouter } from 'react-router-dom';
import Layout from '@/components/Layout';
import StudentShell from '@/pages/student/StudentShell';
import StudentProfile from '@/pages/student/StudentProfile';
import StaffShell from '@/pages/staff/StaffShell';
import AdminShell from '@/pages/admin/AdminShell';
import RequireRole from '@/components/RequireRole';

function WithLayout({ children }: { children: React.ReactNode }) {
    return <Layout>{children}</Layout>;
}

export const router = createBrowserRouter([
    {
        path: '/',
        element: (
            <WithLayout>
                <StudentShell />
            </WithLayout>
        ),
    },
    {
        path: '/student/:id',
        element: (
            <WithLayout>
                <StudentProfile />
            </WithLayout>
        ),
    },
    {
        path: '/staff',
        element: (
            <WithLayout>
                <RequireRole allowedRoles={['teacher']} redirectTo="/admin">
                    <StaffShell />
                </RequireRole>
            </WithLayout>
        ),
    },
    {
        path: '/admin',
        element: (
            <WithLayout>
                <RequireRole allowedRoles={['admin', 'super_admin']}>
                    <AdminShell />
                </RequireRole>
            </WithLayout>
        ),
    },
]);
