import { Link } from 'react-router-dom';

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col bg-neutral-50">
            {/* Logo strip */}
            <div className="px-6 pt-5 pb-1">
                <Link to="/" className="inline-flex items-center no-underline">
                    <img src="/img/sat-makon-logo.png" alt="SAT-MAKON" className="h-16 w-auto" />
                    <span className="ml-3 text-3xl font-bold bg-gradient-to-r from-primary-700 to-primary-500 bg-clip-text text-transparent">SAT Makon</span>
                </Link>
            </div>

            {/* Main content */}
            <main className="flex-1">
                {children}
            </main>

            {/* Footer */}
            <footer className="bg-neutral-900 text-neutral-400 py-6 mt-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm">
                    <p>SAT-MAKON Rating Platform · Student Performance Tracking</p>
                    <p className="text-neutral-600 mt-1 text-xs">
                        Dev mode — routes simulate subdomain split
                    </p>
                </div>
            </footer>
        </div>
    );
}
