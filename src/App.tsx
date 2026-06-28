import { RouterProvider } from 'react-router-dom';
import { DataProvider } from '@/services/DataProvider';
import { AuthProvider } from '@/services/AuthProvider';
import { router } from '@/router';

export default function App() {
    return (
        <DataProvider>
            <AuthProvider>
                <RouterProvider router={router} />
            </AuthProvider>
        </DataProvider>
    );
}
