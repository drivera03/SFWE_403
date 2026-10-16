const API_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function post(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // FastAPI sends errors as { detail: "..." }
    throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.");
  }
  return data;
}

export const login = (email, password) => post("/auth/login", { email, password });

export const register = (email, password, role) =>
  post("/auth/register", { email, password, role });