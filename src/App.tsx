import { RouterProvider } from 'react-router-dom';
import { DataProvider } from '@/services/DataProvider';
import { router } from '@/router';

export default function App() {
    return (
        <DataProvider>
            <RouterProvider router={router} />
        </DataProvider>
    );
}
