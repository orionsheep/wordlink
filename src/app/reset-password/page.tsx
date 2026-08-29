'use client';

import { useState } from 'react';
import { Lock, CheckCircle2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export default function ResetPasswordPage() {
    const router = useRouter();
    const t = useTranslations();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError(t('auth.newPasswordPlaceholder') || 'Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError(t('auth.passwordMismatch') || 'Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const res = await fetch('/api/auth/update-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to update password');
            }

            setSuccess(true);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('auth-state-changed'));
            }

            setTimeout(() => {
                router.push('/home');
                router.refresh();
            }, 1800);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to update password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full bg-black flex items-center justify-center p-4">
            {/* Background Radial Glow */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-900 via-black to-black pointer-events-none"></div>

            <div className="bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative z-10">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
                        {t('auth.resetPasswordTitle') || 'Set New Password'}
                    </h1>
                    <p className="text-neutral-400 text-sm">
                        {t('auth.resetPasswordSubtitle') || 'Enter the new password for your account'}
                    </p>
                </div>

                {success ? (
                    <div className="text-center py-6 space-y-4">
                        <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                            <CheckCircle2 size={32} />
                        </div>
                        <h3 className="text-lg font-semibold text-white">
                            {t('auth.passwordUpdated') || 'Password updated successfully!'}
                        </h3>
                        <p className="text-sm text-neutral-400">
                            {t('common.loading') || 'Redirecting...'}
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs text-neutral-400 uppercase font-semibold tracking-wider">
                                {t('auth.newPassword') || 'New Password'}
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-black/50 border border-neutral-800 rounded-xl py-3 pl-11 pr-11 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder={t('auth.newPasswordPlaceholder') || 'Enter new password'}
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                                    aria-label="Toggle password visibility"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-neutral-400 uppercase font-semibold tracking-wider">
                                {t('auth.confirmNewPassword') || 'Confirm New Password'}
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-black/50 border border-neutral-800 rounded-xl py-3 pl-11 pr-11 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder={t('auth.confirmNewPasswordPlaceholder') || 'Confirm new password'}
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                                    aria-label="Toggle confirm password visibility"
                                >
                                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && (
                            <div className="text-red-400 text-sm text-center bg-red-500/10 py-3 rounded-xl border border-red-500/20 animate-pulse">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                        >
                            <span>{loading ? t('auth.processing') : (t('auth.updatePassword') || 'Update Password')}</span>
                            <ArrowRight size={16} />
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
