import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BeakerIcon } from './Icons';

export default function Navbar() {
  const { currentUser, isAuthenticated, switchRole, logout } = useAuth() || {};
  const location = useLocation();
  const navigate = useNavigate();

  const isPatientsActive =
    location.pathname.startsWith('/patients') &&
    !location.pathname.includes('intake') &&
    !location.pathname.endsWith('/new');

  const isIntakeActive =
    location.pathname.includes('intake') ||
    location.pathname.startsWith('/tests') ||
    location.pathname.endsWith('/new');

  const roles = [
    { id: 'lab_manager', label: 'Lab Manager' },
    { id: 'specimen_collector', label: 'Specimen Collector' },
    { id: 'technician', label: 'Technician' },
    { id: 'pathologist', label: 'Pathologist' },
  ];

  const handleSignOut = () => {
    logout?.();
    navigate('/login');
  };

  return (
    <nav className="nav" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="container nav-inner">
        <Link to="/" className="logo">
          <span className="logo-icon">
            <BeakerIcon size={22} />
          </span>
          <span className="logo-text">CLMS</span>
        </Link>

        <div className="nav-links">
          <Link to="/#features" className="nav-link">
            Features
          </Link>
          <Link to="/#how" className="nav-link">
            How it works
          </Link>
          <Link to="/#roles" className="nav-link">
            Roles
          </Link>
          <Link
            to="/patients"
            className="nav-link"
            style={isPatientsActive ? { color: '#ffffff', fontWeight: 700 } : {}}
          >
            Patients
          </Link>
          <Link
            to="/tests/intake"
            className="nav-link"
            style={isIntakeActive ? { color: '#ffffff', fontWeight: 700 } : {}}
            id="nav-test-intake-link"
          >
            Test Intake
          </Link>

          {/* Persona role switcher for multi-role testing */}
          {isAuthenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Role:
              </span>
              <select
                value={currentUser?.role || ''}
                onChange={(e) => switchRole?.(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '4px',
                  padding: '3px 6px',
                  fontSize: '0.75rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                title="Switch active role persona"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id} style={{ color: '#0f172a' }}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Current user & role display */}
          {isAuthenticated && currentUser ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginLeft: '8px',
                fontSize: '0.85rem',
                color: 'rgba(255,255,255,0.9)',
              }}
            >
              <span>{currentUser.email || currentUser.username}</span>
              <span
                className="role-tag"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  textTransform: 'capitalize',
                  color: '#fff',
                }}
              >
                {currentUser.role}
              </span>
              <button
                type="button"
                className="btn btn-red"
                style={{ border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="btn btn-red"
              style={{ border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
