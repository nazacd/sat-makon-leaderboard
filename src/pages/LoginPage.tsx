import { useState } from 'react';
import { useAuth } from '@/services/AuthProvider';

export default function LoginPage() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const err = login(username.trim(), password);
        setLoading(false);
        if (err) setError(err);
    };

    return (
        <div className="min-h-[70vh] flex items-center justify-center px-4 animate-fade-in">
            <div className="w-full max-w-sm">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-extrabold text-neutral-900">Staff Login</h1>
                    <p className="text-neutral-500 text-sm mt-1">SAT-MAKON Rating Platform</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card border border-neutral-100 p-8 space-y-5">
                    <div>
                        <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            autoComplete="username"
                            className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none text-neutral-800"
                            placeholder="e.g. dilshod"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-neutral-700 mb-1.5">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="current-password"
                            className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 focus:ring-2 focus:ring-primary-500 focus:outline-none text-neutral-800"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-error-50 text-error-700 text-sm font-medium px-4 py-3 rounded-xl border border-error-200">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !username || !password}
                        className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-card transition-colors"
                    >
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>

                <p className="text-center text-xs text-neutral-400 mt-4">
                    No self-signup — accounts are provisioned by an admin.
                </p>
            </div>
        </div>
    );
}
