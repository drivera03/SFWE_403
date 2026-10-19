import { useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { changePassword } from "../services/auth";
import { useAuth } from "../hooks/useAuth";

const MIN_LENGTH = 8; // TODO: match the rule used by RegisterRequest.password

export default function ChangePassword() {
  const { logout } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (form.next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (form.next !== form.confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (form.next === form.current) {
      setError("New password must be different from the current password.");
      return;
    }

    setLoading(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      setSuccess(true);
    } catch (err) {
      if (err.status === 401) {
        logout(); // ProtectedRoute sends the user to /login
        return;
      }
      if (err.status === 423 && err.retryAfter) {
        const minutes = Math.ceil(err.retryAfter / 60);
        setError(`Account temporarily locked. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Change password"
      subtitle="Enter your current password, then choose a new one."
      footer={<Link to="/">Back to home</Link>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {success && <div className="auth-success" role="status">Password updated successfully.</div>}

        <label htmlFor="current">Current password</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required
          value={form.current} onChange={update} />

        <label htmlFor="next">New password</label>
        <input id="next" name="next" type="password" autoComplete="new-password" required
          minLength={MIN_LENGTH} value={form.next} onChange={update} />

        <label htmlFor="confirm">Confirm new password</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required
          value={form.confirm} onChange={update} />

        <button className="auth-btn" type="submit" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
    </AuthLayout>
  );
}