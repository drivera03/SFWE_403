import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BeakerIcon } from './Icons';
import { getLowStock, getExpiring } from '../services/inventory';
import InventoryNotificationModal from './InventoryNotificationModal';

export default function Navbar() {
  const { currentUser, isAuthenticated, switchRole, logout } = useAuth() || {};
  const location = useLocation();
  const navigate = useNavigate();

  const [lowStockItems, setLowStockItems] = useState([]);
  const [expiringItems, setExpiringItems] = useState([]);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);

  const role = currentUser?.role?.toLowerCase() || '';
  const isManager = ['lab_manager', 'manager'].includes(role);
  const hasInventoryAccess = [
    'lab_manager',
    'manager',
    'technician',
    'lab_technician',
    'specimen_collector',
  ].includes(role);

  useEffect(() => {
    if (!isAuthenticated || !hasInventoryAccess) return;

    let ignore = false;
    Promise.all([
      getLowStock().catch(() => []),
      getExpiring(30).catch(() => []),
    ]).then(([lowData, expData]) => {
      if (ignore) return;
      const low = Array.isArray(lowData) ? lowData : [];
      const exp = Array.isArray(expData) ? expData : [];
      setLowStockItems(low);
      setExpiringItems(exp);

      const totalAlerts = low.length + exp.length;
      if (totalAlerts > 0) {
        const sessionKey = `clms_alert_seen_${currentUser?.id || currentUser?.email || 'user'}_${role}`;
        if (!sessionStorage.getItem(sessionKey)) {
          setIsAlertModalOpen(true);
          sessionStorage.setItem(sessionKey, '1');
        }
      }
    });

    return () => {
      ignore = true;
    };
  }, [isAuthenticated, hasInventoryAccess, currentUser?.id, currentUser?.email, role]);

  const roles = [
    { id: 'lab_manager', label: 'Lab Manager' },
    { id: 'specimen_collector', label: 'Specimen Collector' },
    { id: 'technician', label: 'Technician' },
    { id: 'pathologist', label: 'Pathologist' },
    { id: 'cashier', label: 'Cashier' },
  ];

  const handleSignOut = () => {
    logout?.();
    navigate('/login');
  };

  const totalAlerts = lowStockItems.length + expiringItems.length;

  const isPatientsActive =
    location.pathname.startsWith('/patients') &&
    !location.pathname.includes('intake') &&
    !location.pathname.endsWith('/new');

  const isIntakeActive =
    location.pathname.includes('intake') ||
    location.pathname.startsWith('/tests') ||
    location.pathname.endsWith('/new');

  const isInventoryActive = location.pathname.startsWith('/inventory');
  const isMaintenanceActive = location.pathname.includes('maintenance');
  const isUnlockActive = location.pathname === '/unlock-accounts';

  return (
    <>
      <nav className="nav" style={{ position: 'sticky', top: 0, zIndex: 100 }}>
        <div
          className="container nav-inner"
          style={{
            maxWidth: '1440px',
            padding: '0 24px',
            height: '72px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          {/* Left: Brand Logo & Main Nav Links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexShrink: 0 }}>
            <Link to="/" className="logo" style={{ textDecoration: 'none' }}>
              <span className="logo-icon">
                <BeakerIcon size={22} />
              </span>
              <span className="logo-text">CLMS</span>
            </Link>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {!isAuthenticated ? (
                <>
                  <Link to="/#features" className="nav-link">Features</Link>
                  <Link to="/#how" className="nav-link">How it works</Link>
                  <Link to="/#roles" className="nav-link">Roles</Link>
                </>
              ) : (
                <>
                  <Link
                    to="/patients"
                    className="nav-link"
                    style={
                      isPatientsActive
                        ? { color: '#ffffff', fontWeight: 700, borderBottom: '2px solid #ab0520' }
                        : {}
                    }
                  >
                    Patients
                  </Link>

                  <Link
                    to="/tests/intake"
                    className="nav-link"
                    style={
                      isIntakeActive
                        ? { color: '#ffffff', fontWeight: 700, borderBottom: '2px solid #ab0520' }
                        : {}
                    }
                    id="nav-test-intake-link"
                  >
                    Test Intake
                  </Link>

                  <Link
                    to="/inventory"
                    className="nav-link"
                    style={
                      isInventoryActive
                        ? { color: '#ffffff', fontWeight: 700, borderBottom: '2px solid #ab0520' }
                        : {}
                    }
                    id="nav-inventory-link"
                  >
                    Inventory
                    {totalAlerts > 0 && (
                      <span
                        style={{
                          marginLeft: '6px',
                          background: '#ab0520',
                          color: '#ffffff',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                        }}
                      >
                        {totalAlerts}
                      </span>
                    )}
                  </Link>

                  <Link
                    to="/equipment/maintenance"
                    className="nav-link"
                    style={
                      isMaintenanceActive
                        ? { color: '#ffffff', fontWeight: 700, borderBottom: '2px solid #ab0520' }
                        : {}
                    }
                    id="nav-equipment-maintenance-link"
                  >
                    Equipment Maintenance
                  </Link>

                  {isManager && (
                    <Link
                      to="/unlock-accounts"
                      className="nav-link"
                      style={
                        isUnlockActive
                          ? { color: '#ffffff', fontWeight: 700, borderBottom: '2px solid #ab0520' }
                          : {}
                      }
                    >
                      Unlock Accounts
                    </Link>
                  )}

                  {isManager && (
                    <Link
                      to="/activity-logs"
                      className="nav-link"
                      style={
                        location.pathname === '/activity-logs'
                          ? { color: '#ffffff', fontWeight: 700, borderBottom: '2px solid #ab0520' }
                          : {}
                      }
                    >
                      Activity Logs
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right: Actions, Alerts, Persona Switcher & User Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            {isAuthenticated && hasInventoryAccess && (
              <button
                type="button"
                onClick={() => setIsAlertModalOpen(true)}
                title={totalAlerts > 0 ? `${totalAlerts} items require attention` : 'No inventory alerts'}
                style={{
                  background: totalAlerts > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                  border: totalAlerts > 0 ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.25)',
                  borderRadius: '20px',
                  padding: '5px 12px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  color: '#ffffff',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '1rem' }}>🔔</span>
                <span>Alerts</span>
                {totalAlerts > 0 && (
                  <span
                    style={{
                      background: '#ef4444',
                      color: '#ffffff',
                      borderRadius: '50%',
                      padding: '1px 6px',
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      lineHeight: 1.2,
                    }}
                  >
                    {totalAlerts}
                  </span>
                )}
              </button>
            )}

            {/* Persona role switcher for testing */}
            {isAuthenticated && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'rgba(255,255,255,0.7)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
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
                    padding: '4px 8px',
                    fontSize: '0.8rem',
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

            {/* User Info & Logout */}
            {isAuthenticated && currentUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'rgba(255,255,255,0.12)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.2)',
                  }}
                >
                  <span style={{ fontSize: '0.825rem', color: 'rgba(255,255,255,0.95)', fontWeight: 500 }}>
                    {currentUser.email || currentUser.username}
                  </span>
                  <span
                    className="role-tag"
                    style={{
                      background: 'rgba(255,255,255,0.25)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      textTransform: 'capitalize',
                      color: '#ffffff',
                      fontWeight: 600,
                    }}
                  >
                    {currentUser.role}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-red"
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.825rem',
                    padding: '6px 14px',
                  }}
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Link to="/signup" className="nav-link" style={{ fontSize: '0.9rem' }}>
                  Create account
                </Link>
                <Link
                  to="/login"
                  className="btn btn-red"
                  style={{
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: '7px 16px',
                    textDecoration: 'none',
                  }}
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Low Stock & Expiring Notification Popup */}
      <InventoryNotificationModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        lowStockItems={lowStockItems}
        expiringItems={expiringItems}
      />
    </>
  );
}
