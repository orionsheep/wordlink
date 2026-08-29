'use client';

import { useState } from 'react';
import { Mail, Lock, ArrowLeft, Send, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type AuthMode = 'login' | 'register' | 'forgot' | 'resend';

export default function LoginPage() {
    const router = useRouter();
    const t = useTranslations();
    const [mode, setMode] = useState<AuthMode>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);

    const switchMode = (newMode: AuthMode) => {
        setMode(newMode);
        setError('');
        setSuccessMessage('');
        setPassword('');
        setConfirmPassword('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (mode === 'register') {
            if (password.length < 6) {
                setError(t('auth.newPasswordPlaceholder') || 'Password must be at least 6 characters');
                return;
            }
            if (password !== confirmPassword) {
                setError(t('auth.passwordMismatch') || 'Passwords do not match');
                return;
            }
        }

        setLoading(true);

        try {
            if (mode === 'login') {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || t('auth.loginError') || 'Login failed');

                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('auth-state-changed'));
                }
                router.push('/home');
                router.refresh();
            } else if (mode === 'register') {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, password }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || t('auth.registerError') || 'Registration failed');

                if (data.needsEmailConfirmation) {
                    setSuccessMessage(
                        data.message || t('auth.emailConfirmationSent') || 'Registration successful! Please check your email to verify.'
                    );
                    setMode('login');
                    return;
                }

                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('auth-state-changed'));
                }
                router.push('/home');
                router.refresh();
            } else if (mode === 'forgot') {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to send reset email');

                setSuccessMessage(
                    data.message || t('auth.resetEmailSent') || 'Password reset link sent! Check your inbox.'
                );
            } else if (mode === 'resend') {
                const res = await fetch('/api/auth/resend-confirmation', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to resend confirmation');

                setSuccessMessage(
                    data.message || t('auth.confirmationEmailSent') || 'Verification email resent! Check your inbox.'
                );
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    const getTitle = () => {
        switch (mode) {
            case 'register':
                return t('auth.createAccountSubtitle') || 'Create your account';
            case 'forgot':
                return t('auth.forgotPasswordTitle') || 'Reset Password';
            case 'resend':
                return t('auth.resendConfirmationTitle') || 'Resend Verification';
            default:
                return t('auth.signInSubtitle') || 'Sign in to continue';
        }
    };

    const getSubtitle = () => {
        switch (mode) {
            case 'forgot':
                return t('auth.forgotPasswordSubtitle') || 'Enter your registered email';
            case 'resend':
                return t('auth.resendConfirmationSubtitle') || 'Enter your email to receive activation link';
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen w-full bg-black flex items-center justify-center p-4">
            {/* Background Effect */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-neutral-900 via-black to-black pointer-events-none"></div>

            <div className="bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-2xl w-full max-w-md p-8 shadow-2xl relative z-10">
                {mode !== 'login' && (
                    <button
                        onClick={() => switchMode('login')}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white mb-6 transition-colors"
                    >
                        <ArrowLeft size={14} />
                        <span>{t('auth.backToLogin') || 'Back to Sign In'}</span>
                    </button>
                )}

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">{t('auth.clubName')}</h1>
                    <p className="text-neutral-400 text-sm">{getTitle()}</p>
                    {getSubtitle() && (
                        <p className="text-neutral-500 text-xs mt-1">{getSubtitle()}</p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Email Field */}
                    <div className="space-y-2">
                        <label className="text-xs text-neutral-400 uppercase font-semibold tracking-wider">
                            {t('auth.email')}
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-black/50 border border-neutral-800 rounded-xl py-3 pl-11 pr-4 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                placeholder={t('auth.emailPlaceholder')}
                                required
                            />
                        </div>
                    </div>

                    {/* Password Field */}
                    {(mode === 'login' || mode === 'register') && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-neutral-400 uppercase font-semibold tracking-wider">
                                    {t('auth.password')}
                                </label>
                                {mode === 'login' && (
                                    <button
                                        type="button"
                                        onClick={() => switchMode('forgot')}
                                        className="text-xs text-neutral-500 hover:text-blue-400 transition-colors"
                                    >
                                        {t('auth.forgotPassword') || 'Forgot password?'}
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-black/50 border border-neutral-800 rounded-xl py-3 pl-11 pr-11 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder={mode === 'register' ? (t('auth.newPasswordPlaceholder') || 'Enter password (min 6 chars)') : t('auth.passwordPlaceholder')}
                                    required
                                    minLength={mode === 'register' ? 6 : undefined}
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
                    )}

                    {/* Confirm Password Field (Register Mode Only) */}
                    {mode === 'register' && (
                        <div className="space-y-2">
                            <label className="text-xs text-neutral-400 uppercase font-semibold tracking-wider">
                                {t('auth.confirmNewPassword') || 'Confirm Password'}
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-black/50 border border-neutral-800 rounded-xl py-3 pl-11 pr-11 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                                    placeholder={t('auth.confirmNewPasswordPlaceholder') || 'Confirm your password'}
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
                    )}

                    {error && (
                        <div className="text-red-400 text-sm text-center bg-red-500/10 py-3 rounded-xl border border-red-500/20 animate-pulse">
                            {error}
                        </div>
                    )}

                    {successMessage && (
                        <div className="text-emerald-400 text-sm text-center bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                            {successMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5 rounded-xl transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <span>{t('auth.processing')}</span>
                        ) : mode === 'register' ? (
                            <span>{t('auth.createAccount')}</span>
                        ) : mode === 'forgot' ? (
                            <>
                                <span>{t('auth.sendResetEmail') || 'Send Reset Link'}</span>
                                <Send size={16} />
                            </>
                        ) : mode === 'resend' ? (
                            <>
                                <span>{t('auth.sendConfirmationEmail') || 'Send Activation Email'}</span>
                                <Send size={16} />
                            </>
                        ) : (
                            <span>{t('auth.signIn')}</span>
                        )}
                    </button>
                </form>

                {/* Footer Switch Links */}
                <div className="mt-8 space-y-3 text-center text-sm text-neutral-500">
                    {mode === 'login' && (
                        <>
                            <div>
                                {t('auth.dontHaveAccount')}{' '}
                                <button
                                    onClick={() => switchMode('register')}
                                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors hover:underline underline-offset-4"
                                >
                                    {t('auth.register')}
                                </button>
                            </div>
                            <div>
                                <button
                                    onClick={() => switchMode('resend')}
                                    className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                                >
                                    {t('auth.resendConfirmation') || 'Resend confirmation email'}
                                </button>
                            </div>
                        </>
                    )}

                    {mode === 'register' && (
                        <div>
                            {t('auth.alreadyHaveAccount')}{' '}
                            <button
                                onClick={() => switchMode('login')}
                                className="text-blue-400 hover:text-blue-300 font-medium transition-colors hover:underline underline-offset-4"
                            >
                                {t('auth.signIn')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
