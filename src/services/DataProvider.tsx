// ===== Data Layer React Context =====
// Provides the IDataRepository to all components via React context.
// Components consume via useData() — never import mock directly.

import { createContext, useContext, type ReactNode } from 'react';
import type { IDataRepository } from '@/services/interfaces';
import { mockRepository } from '@/services/mock';
import { initConfig } from '@/config';

// Initialize config from the data layer at boot
initConfig(mockRepository.getConfig());

const DataContext = createContext<IDataRepository | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
    return (
        <DataContext.Provider value={mockRepository}>
            {children}
        </DataContext.Provider>
    );
}

export function useData(): IDataRepository {
    const ctx = useContext(DataContext);
    if (!ctx) {
        throw new Error('useData must be used within a DataProvider');
    }
    return ctx;
}
