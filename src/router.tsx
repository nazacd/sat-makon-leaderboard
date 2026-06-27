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
                <StaffShell />
            </WithLayout>
        ),
    },
    {
        path: '/admin',
        element: (
            <WithLayout>
                <AdminShell />
            </WithLayout>
        ),
    },
]);
