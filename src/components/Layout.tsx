import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
    { path: '/', label: 'Student Board', icon: '🏆' },
    { path: '/staff', label: 'Teacher Portal', icon: '📝' },
    { path: '/admin', label: 'Admin Dashboard', icon: '⚙️' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
    const location = useLocation();

    return (
        <div className="min-h-screen flex flex-col bg-neutral-50">
            {/* Header */}
            <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-3 no-underline">
                            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center shadow-sm">
                                <span className="text-white font-bold text-sm">SM</span>
                            </div>
                            <span className="text-xl font-bold bg-gradient-to-r from-primary-700 to-primary-500 bg-clip-text text-transparent">
                                SAT-MAKON
                            </span>
                        </Link>

                        {/* Navigation */}
                        <nav className="flex items-center gap-1">
                            {NAV_ITEMS.map((item) => {
                                const isActive =
                                    item.path === '/'
                                        ? location.pathname === '/'
                                        : location.pathname.startsWith(item.path);

                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={`
                      px-3 py-2 rounded-lg text-sm font-medium no-underline transition-all duration-200
                      ${isActive
                                                ? 'bg-primary-50 text-primary-700 shadow-sm'
                                                : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'
                                            }
                    `}
                                    >
                                        <span className="hidden sm:inline mr-1.5">{item.icon}</span>
                                        <span className="hidden md:inline">{item.label}</span>
                                        <span className="md:hidden">{item.icon}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="flex-1">
                {children}
            </main>

            {/* Footer */}
            <footer className="bg-neutral-900 text-neutral-400 py-6">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm">
                    <p>SAT-MAKON Rating Platform · Student Performance Tracking</p>
                    <p className="text-neutral-600 mt-1 text-xs">
                        {/* NOTE: Subdomain split (student.sat-makon / staff.sat-makon) is a deployment concern. */}
                        {/* Dev uses routes: / (student) · /staff (teacher) · /admin */}
                        Dev mode — routes simulate subdomain split
                    </p>
                </div>
            </footer>
        </div>
    );
}
