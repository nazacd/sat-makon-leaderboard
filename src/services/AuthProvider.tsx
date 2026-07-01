import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useData } from '@/services/DataProvider';
import type { Teacher } from '@shared/types';

interface AuthContextValue {
    session: Teacher | null;
    login: (username: string, password: string) => string | null;
    logout: () => void;
}

const SESSION_KEY = 'sm_staff_session';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const repo = useData();

    const [session, setSession] = useState<Teacher | null>(() => {
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (!saved) return null;
            const { staffId } = JSON.parse(saved) as { staffId: string };
            const teacher = repo.getTeachers(false).find((t) => t.id === staffId);
            return teacher ?? null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        if (session) {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({ staffId: session.id }));
        } else {
            sessionStorage.removeItem(SESSION_KEY);
        }
    }, [session]);

    const login = (username: string, password: string): string | null => {
        const teacher = repo.authenticateStaff(username, password);
        if (!teacher) return 'Invalid username or password.';
        setSession(teacher);
        return null;
    };

    const logout = () => {
        setSession(null);
    };

    return (
        <AuthContext.Provider value={{ session, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
    return ctx;
}
