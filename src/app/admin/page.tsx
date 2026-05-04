'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        // Check if cookie exists (simple client-side check, real check is API calls)
        // Actually, we can't easily check httpOnly cookie on client.
        // We'll rely on a check-auth API or just try to login.
        // For simplicity, let's assume not authenticated initially unless we persist state?
        // Better: Create an API to check status.
        // Or just use a server component?
        // Let's stick to client component for now and maybe add a check endpoint later.
        // For now, just show login form. If they login, we set state.
        // But on refresh, state is lost.
        // Let's add a simple /api/admin/check endpoint.
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const res = await fetch('/api/admin/check');
            if (res.ok) {
                setIsAuthenticated(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (res.ok) {
                setIsAuthenticated(true);
            } else {
                const data = await res.json();
                setError(data.error || 'Login failed');
            }
        } catch (e) {
            setError('An error occurred');
        }
    };

    if (loading) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Loading...</div>;

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
                <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl p-8">
                    <h1 className="text-2xl font-bold mb-6 text-center">Admin Access</h1>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm text-neutral-400 mb-1">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-2 focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-neutral-400 mb-1">Password</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-black border border-neutral-700 rounded-lg px-4 py-2 focus:border-blue-500 outline-none"
                            />
                        </div>
                        {error && <p className="text-red-500 text-sm">{error}</p>}
                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium transition-colors"
                        >
                            Login
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
                <p className="text-neutral-400">Welcome, Administrator.</p>
                {/* Add admin features here later */}
            </div>
        </div>
    );
}
