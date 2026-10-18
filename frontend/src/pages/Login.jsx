import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { login } from "../services/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(form.email, form.password);
      // TODO: move this into your AuthContext / useAuth() once it exists
      localStorage.setItem("token", data.access_token);
      const from = location.state?.from;
      const destination = from?.pathname?.startsWith("/") &&
        !from.pathname.startsWith("//") && from.pathname !== "/login"
        ? { pathname: from.pathname, search: from.search, hash: from.hash }
        : "/";
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Use the account your Lab Manager created for you."
      footer={
  <>
    Need an account? <Link to="/signup">Create one</Link>
    <br />
    <Link to="/change-password">Change password</Link>
  </>
}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error" role="alert">{error}</div>}

        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required
          value={form.email} onChange={update} placeholder="name@example.com" />

        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required
          value={form.password} onChange={update} />

        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}
