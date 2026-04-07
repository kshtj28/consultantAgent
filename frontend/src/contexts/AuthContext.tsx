import React, { createContext, useContext, useState, useEffect } from 'react';
import { validateToken } from '../services/api';

interface User {
    userId: string;
    username: string;
    role: string;
    firstName?: string;
    lastName?: string;
    organization?: string;
    department?: string;
    language?: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(() => {
        const storedUser = localStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));

    const login = (newToken: string, newUser: User) => {
        setToken(newToken);
        setUser(newUser);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(newUser));
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    };

    // Validate stored token on mount
    useEffect(() => {
        if (!token) return;
        validateToken()
            .then(({ user: validatedUser }) => {
                setUser(validatedUser);
                localStorage.setItem('user', JSON.stringify(validatedUser));
            })
            .catch(() => {
                logout();
            });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, isAdmin: user?.role === 'admin' }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
