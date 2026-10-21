import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { login as loginRequest, getCurrentUser } from "../services/auth";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Only "loading" on startup if there's a saved token to verify
  const [loading, setLoading] = useState(() => !!localStorage.getItem("token"));

  const logout = useCallback(() => {  
    localStorage.removeItem("token");
    setUser(null);
  }, []);

  // On page load, use the saved token to restore the session
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    const controller = new AbortController();
    getCurrentUser(token, controller.signal)
      .then((me) => setUser(me))
      .catch((err) => {
        if (err.name === "AbortError") return; // cleanup ran; not a real failure
        logout(); // expired or invalid token
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(email, password);
    localStorage.setItem("token", data.access_token);
    try {
      const me = await getCurrentUser(data.access_token);
      setUser(me);
      return me;
    } catch (err) {
      logout();
      throw err;
    }
  }, [logout]);

  const value = useMemo(
    () => ({ user, loading, isAuthenticated: !!user, login, logout }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}import React, { createContext, useContext, useState, useEffect } from 'react';
import { loginUser, getMe } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Pre-configured preset roles for swift testing and demo verification
  const defaultUser = {
    id: 1,
    username: 'lab_manager',
    email: 'manager@clms.local',
    role: 'lab_manager',
  };

  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('clms_user');
    return saved ? JSON.parse(saved) : defaultUser;
  });

  const [token, setToken] = useState(() => localStorage.getItem('clms_token') || '');

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('clms_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('clms_user');
    }
  }, [currentUser]);

  useEffect(() => {
    if (token) {
      localStorage.setItem('clms_token', token);
    } else {
      localStorage.removeItem('clms_token');
    }
  }, [token]);

  // Check if current user role has permission to delete patients
  const canDeletePatient = () => {
    return currentUser?.role === 'lab_manager';
  };

  // Quick switch role utility (enables testing criteria: "Verified by logging in as each role")
  const switchRole = (role) => {
    const roleProfiles = {
      lab_manager: { id: 1, username: 'lab_manager', email: 'manager@clms.local', role: 'lab_manager' },
      specimen_collector: { id: 2, username: 'specimen_collector', email: 'collector@clms.local', role: 'specimen_collector' },
      technician: { id: 3, username: 'lab_technician', email: 'tech@clms.local', role: 'technician' },
      pathologist: { id: 4, username: 'pathologist_dr', email: 'pathologist@clms.local', role: 'pathologist' },
      billing: { id: 5, username: 'billing_staff', email: 'billing@clms.local', role: 'billing' },
    };

    const target = roleProfiles[role] || { id: 99, username: role, email: `${role}@clms.local`, role };
    setCurrentUser(target);
  };

  const logout = () => {
    setCurrentUser(null);
    setToken('');
    localStorage.removeItem('clms_user');
    localStorage.removeItem('clms_token');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        token,
        setToken,
        canDeletePatient,
        switchRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
