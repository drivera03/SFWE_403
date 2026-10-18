import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { getCurrentUser } from "../services/auth";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <VerifiedSession key={token} token={token} location={location}>
      {children}
    </VerifiedSession>
  );
}

function VerifiedSession({ token, location, children }) {
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getCurrentUser(token, controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setStatus("authenticated");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) {
          if (localStorage.getItem("token") === token) {
            localStorage.removeItem("token");
          }
          setStatus("unauthenticated");
        } else {
          setStatus("error");
        }
      });

    return () => controller.abort();
  }, [token, attempt]);

  if (status === "loading") return <p role="status">Checking your session...</p>;
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  if (status === "error") {
    return (
      <div role="alert">
        <p>Unable to verify your session. Please try again.</p>
        <button type="button" onClick={() => {
          setStatus("loading");
          setAttempt((value) => value + 1);
        }}>Try again</button>
      </div>
    );
  }

  return children ?? <Outlet />;
}
