import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { getLockedUsers, unlockUser } from "../services/auth";

export default function UnlockAccounts() {
  const [lockedUsers, setLockedUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadLockedUsers = useCallback(async () => {
    try {
      setLockedUsers(await getLockedUsers());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const list = await getLockedUsers();
        if (!ignore) setLockedUsers(list);
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoadingList(false);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedId) return;
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const user = lockedUsers.find((u) => String(u.id) === selectedId);
      await unlockUser(selectedId);
      setSuccess(`Unlocked ${user ? user.email : "account"}.`);
      setSelectedId("");
      await loadLockedUsers(); // refresh so the unlocked user drops out of the list
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const noneLocked = !loadingList && lockedUsers.length === 0;

  return (
    <AuthLayout
      title="Unlock accounts"
      subtitle="Select a locked account and unlock it."
      footer={<Link to="/patients">Back to patients</Link>}
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {success && <div className="auth-success" role="status">{success}</div>}

        <label htmlFor="user">Locked account</label>
        <select
          id="user"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={loadingList || noneLocked}
        >
          <option value="">
            {loadingList ? "Loading..." : noneLocked ? "No accounts are locked" : "Select an account"}
          </option>
          {lockedUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.email} ({u.role})
            </option>
          ))}
        </select>

        <button className="auth-btn" type="submit" disabled={!selectedId || submitting}>
          {submitting ? "Unlocking..." : "Unlock"}
        </button>
      </form>
    </AuthLayout>
  );
}