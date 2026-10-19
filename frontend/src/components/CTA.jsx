import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function CTA() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="cta">
      <div className="container narrow center">
        <h2>Ready to start your shift?</h2>
        {isAuthenticated ? (
          <>
            <p>You're signed in. Pick up where you left off.</p>
            <Link to="/patients" className="btn btn-white btn-lg">Go to Patients</Link>
          </>
        ) : (
          <>
            <p>Sign in with the account your Lab Manager created for you.</p>
            <Link to="/login" className="btn btn-white btn-lg">Sign in to CLMS</Link>
          </>
        )}
      </div>
    </section>
  );
}