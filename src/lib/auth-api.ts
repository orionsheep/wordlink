/**
 * LPT Auth API Client
 *
 * Client for interacting with the LPT unified authentication system.
 * All requests use credentials: "include" to handle httpOnly cookies.
 */

const AUTH_API_BASE = process.env.AUTH_API_BASE || 'https://auth.lifeplayertribe.com/api/v1';

export interface AuthUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  message: string;
  user: AuthUser;
}

export interface RegisterResponse {
  message: string;
  user: AuthUser;
}

export interface MeResponse {
  user: AuthUser;
}

/**
 * Login with email and password
 * Sets lpt_session cookie automatically
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${AUTH_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(error.message || 'Login failed');
  }

  return response.json();
}

/**
 * Register with email, password, and keyCode
 * Sets lpt_session cookie automatically
 */
export async function register(
  email: string,
  password: string,
  keyCode: string
): Promise<RegisterResponse> {
  const response = await fetch(`${AUTH_API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password, keyCode }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Registration failed' }));
    throw new Error(error.message || 'Registration failed');
  }

  return response.json();
}

/**
 * Logout current user
 * Clears lpt_session cookie
 */
export async function logout(): Promise<{ message: string }> {
  const response = await fetch(`${AUTH_API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Logout failed' }));
    throw new Error(error.message || 'Logout failed');
  }

  return response.json();
}

/**
 * Get current authenticated user
 * Validates lpt_session cookie
 */
export async function getMe(): Promise<MeResponse> {
  const response = await fetch(`${AUTH_API_BASE}/auth/me`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Not authenticated' }));
    throw new Error(error.message || 'Not authenticated');
  }

  return response.json();
}
