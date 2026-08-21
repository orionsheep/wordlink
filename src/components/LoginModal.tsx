'use client';

import { useState } from 'react';
import { X, Lock, Mail, ArrowLeft, Send, Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LoginModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoginSuccess: (user: { id: string; email?: string; username?: string; role?: string }) => void;
}

type AuthMode = 'login' | 'register' | 'forgot' | 'resend';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
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

    if (!isOpen) return null;

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

                window.dispatchEvent(new CustomEvent('auth-state-changed'));
                onLoginSuccess(data.user);
                onClose();
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

                window.dispatchEvent(new CustomEvent('auth-state-changed'));
                onLoginSuccess(data.user);
                onClose();
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl w-full max-w-md p-6 shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                {mode !== 'login' && (
                    <button
                        onClick={() => switchMode('login')}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white mb-4 transition-colors"
                    >
                        <ArrowLeft size={14} />
                        <span>{t('auth.backToLogin') || 'Back to Sign In'}</span>
                    </button>
                )}

                <h2 className="text-2xl font-bold text-white mb-6 text-center">
                    {getTitle()}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email */}
                    <div className="space-y-2">
                        <label className="text-xs text-neutral-400 uppercase font-semibold tracking-wider">
                            {t('auth.email')}
                        </label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-4 h-4" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors"
                                placeholder={t('auth.emailPlaceholder')}
                                required
                            />
                        </div>
                    </div>

                    {/* Password */}
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
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-4 h-4" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 pl-10 pr-10 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors"
                                    placeholder={mode === 'register' ? (t('auth.newPasswordPlaceholder') || 'Enter password (min 6 chars)') : t('auth.passwordPlaceholder')}
                                    required
                                    minLength={mode === 'register' ? 6 : undefined}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                                    aria-label="Toggle password visibility"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Confirm Password (Register Mode Only) */}
                    {mode === 'register' && (
                        <div className="space-y-2">
                            <label className="text-xs text-neutral-400 uppercase font-semibold tracking-wider">
                                {t('auth.confirmNewPassword') || 'Confirm Password'}
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-4 h-4" />
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg py-2.5 pl-10 pr-10 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors"
                                    placeholder={t('auth.confirmNewPasswordPlaceholder') || 'Confirm your password'}
                                    required
                                    minLength={6}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1"
                                    aria-label="Toggle confirm password visibility"
                                >
                                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">
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
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <span>{t('auth.processing')}</span>
                        ) : mode === 'register' ? (
                            <span>{t('auth.createAccount')}</span>
                        ) : mode === 'forgot' ? (
                            <>
                                <span>{t('auth.sendResetEmail') || 'Send Reset Link'}</span>
                                <Send size={14} />
                            </>
                        ) : mode === 'resend' ? (
                            <>
                                <span>{t('auth.sendConfirmationEmail') || 'Send Activation Email'}</span>
                                <Send size={14} />
                            </>
                        ) : (
                            <span>{t('auth.signIn')}</span>
                        )}
                    </button>
                </form>

                <div className="mt-6 space-y-2 text-center text-sm text-neutral-500">
                    {mode === 'login' && (
                        <>
                            <div>
                                {t('auth.dontHaveAccount')}{' '}
                                <button
                                    onClick={() => switchMode('register')}
                                    className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
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
                                className="text-blue-400 hover:text-blue-300 font-medium transition-colors"
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
