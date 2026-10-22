const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function getCurrentUser(token, signal) {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    const error = new Error("Unable to verify your session.");
    error.status = res.status;
    throw error;
  }
  return res.json();
}

async function request(method, path, body, { auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = `Bearer ${localStorage.getItem("token")}`;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({})); // 204 has no body, so this falls back to {}
  if (!res.ok) {
    // FastAPI sends errors as { detail: "..." }
    const err = new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.");
    err.status = res.status;
    err.retryAfter = Number(res.headers.get("Retry-After")) || null;
    throw err;
  }
  return data;
}

const post = (path, body, opts) => request("POST", path, body, opts);
const get = (path, opts) => request("GET", path, undefined, opts);

export const login = (email, password) => post("/auth/login", { email, password });

export const register = (email, password, role) =>
  post("/auth/register", { email, password, role }, { auth: true });

export const changePassword = (currentPassword, newPassword) =>
  post("/auth/change-password", { current_password: currentPassword, new_password: newPassword }, { auth: true });

export const getLockedUsers = () => get("/auth/locked-users", { auth: true });

export const unlockUser = (userId) => post(`/auth/unlock/${userId}`, undefined, { auth: true });
