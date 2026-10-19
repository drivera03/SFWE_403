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
}