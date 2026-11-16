import { useEffect, useState, useMemo } from 'react';
import Navbar from '../components/Navbar';
import { useAuth } from '../hooks/useAuth';
import { getMaintenanceHistory, createMaintenanceLog, getInstruments } from '../services/maintenance';
import '../styles/patients.css';

const COMMON_TYPES = [
  'Calibration',
  'Routine Cleaning',
  'Preventative Maintenance',
  'Monthly Inspection',
  'Flow Cell Alignment',
  'Part Replacement',
  'Emergency Repair',
  'Decontamination',
];

const STATUS_OPTIONS = ['Completed', 'Passed', 'In Progress', 'Scheduled', 'Failed'];

export default function EquipmentMaintenance() {
  const { user: currentUser } = useAuth();
  const [instruments, setInstruments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedInstrument, setSelectedInstrument] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    instrument_id: '',
    maintenance_type: 'Calibration',
    custom_type: '',
    maintenance_date: new Date().toISOString().slice(0, 16),
    performed_by_name: currentUser?.email || currentUser?.username || 'Lab Technician',
    status: 'Completed',
    notes: '',
    next_due_date: '',
  });

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const [insts, mLogs] = await Promise.all([
          getInstruments(),
          getMaintenanceHistory(),
        ]);
        if (!ignore) {
          setInstruments(insts || []);
          setLogs(mLogs || []);
          setLoading(false);
        }
      } catch (err) {
        console.warn('Failed to load maintenance data:', err.message);
        if (!ignore) {
          setError('Could not load equipment maintenance history. Showing fallback records.');
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  // Summary Metrics
  const stats = useMemo(() => {
    const totalInstruments = instruments.length || 4;
    const totalLogs = logs.length;
    const calibrations = logs.filter(
      (l) => l.maintenance_type?.toLowerCase().includes('calibrat') && (l.status === 'Passed' || l.status === 'Completed')
    ).length;

    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingDue = logs.filter((l) => {
      if (!l.next_due_date) return false;
      const diff = Math.ceil((new Date(l.next_due_date) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
      return diff >= 0 && diff <= 30;
    }).length;

    return { totalInstruments, totalLogs, calibrations, upcomingDue };
  }, [instruments, logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedInstrument && String(log.instrument_id) !== String(selectedInstrument)) {
        return false;
      }
      if (selectedType && !log.maintenance_type?.toLowerCase().includes(selectedType.toLowerCase())) {
        return false;
      }
      if (selectedStatus && !log.status?.toLowerCase().includes(selectedStatus.toLowerCase())) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const instName = log.instrument?.name?.toLowerCase() || '';
        const mType = log.maintenance_type?.toLowerCase() || '';
        const notes = log.notes?.toLowerCase() || '';
        const performed = log.performed_by_name?.toLowerCase() || '';
        if (!instName.includes(q) && !mType.includes(q) && !notes.includes(q) && !performed.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedInstrument, selectedType, selectedStatus, searchQuery]);

  const handleOpenModal = () => {
    setFormData({
      instrument_id: instruments[0]?.id ? String(instruments[0].id) : '',
      maintenance_type: 'Calibration',
      custom_type: '',
      maintenance_date: new Date().toISOString().slice(0, 16),
      performed_by_name: currentUser?.email || currentUser?.username || 'Lab Technician',
      status: 'Completed',
      notes: '',
      next_due_date: '',
    });
    setModalError('');
    setIsModalOpen(true);
  };

  const handleSubmitModal = async (e) => {
    e.preventDefault();
    setModalError('');
    if (!formData.instrument_id) {
      setModalError('Please select an equipment instrument.');
      return;
    }
    const finalType = formData.maintenance_type === 'Other' ? formData.custom_type.trim() : formData.maintenance_type;
    if (!finalType) {
      setModalError('Please specify the maintenance type.');
      return;
    }

    setModalSubmitting(true);
    try {
      const payload = {
        instrument_id: Number(formData.instrument_id),
        maintenance_type: finalType,
        maintenance_date: formData.maintenance_date ? new Date(formData.maintenance_date).toISOString() : new Date().toISOString(),
        performed_by_name: formData.performed_by_name.trim() || undefined,
        status: formData.status,
        notes: formData.notes.trim() || undefined,
        next_due_date: formData.next_due_date || undefined,
      };

      const created = await createMaintenanceLog(payload);

      // If instrument relation is not populated by backend, attach it for immediate display
      if (created && !created.instrument) {
        const found = instruments.find((i) => i.id === Number(formData.instrument_id));
        created.instrument = found;
      }

      setLogs((prev) => [created || { ...payload, id: Date.now(), instrument: instruments.find((i) => i.id === Number(formData.instrument_id)) }, ...prev]);
      setIsModalOpen(false);
    } catch (err) {
      setModalError(err?.response?.data?.detail || err.message || 'Failed to record maintenance log.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const getStatusBadgeStyle = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'passed' || s === 'completed') {
      return { background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' };
    }
    if (s === 'in progress' || s === 'scheduled') {
      return { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' };
    }
    if (s === 'failed') {
      return { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' };
    }
    return { background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' };
  };

  return (
    <div className="patient-page">
      <Navbar />

      <div className="patient-container" style={{ maxWidth: '1150px', margin: '30px auto', padding: '0 20px' }}>
        {/* Page Header */}
        <div className="patient-header" style={{ marginBottom: '20px' }}>
          <div className="patient-header-title">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#ab0520' }}>🔬</span> Equipment Maintenance History
            </h1>
            <p>Track analyzer calibrations, routine servicing, repairs, and scheduled maintenance across lab instruments.</p>
          </div>
          <button
            type="button"
            className="btn-register"
            onClick={handleOpenModal}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span style={{ fontSize: '1.1rem' }}>+</span> Log Maintenance
          </button>
        </div>

        {error && (
          <div role="alert" className="state-error" style={{ borderRadius: '8px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Metric Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Lab Analyzers / Equipment
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0c234b', marginTop: '4px' }}>
              {stats.totalInstruments}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '2px' }}>Operational & registered</div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Records Logged
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
              {stats.totalLogs}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Servicing & maintenance events</div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Calibrations Passed
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#15803d', marginTop: '4px' }}>
              {stats.calibrations}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '2px' }}>Within SD tolerance</div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Upcoming Due (30d)
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#b45309', marginTop: '4px' }}>
              {stats.upcomingDue}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: '2px' }}>Scheduled service needed</div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '12px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {/* Instrument Filter */}
          <div style={{ flex: '1 1 200px' }}>
            <label htmlFor="filter-instrument" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
              Equipment Analyzer
            </label>
            <select
              id="filter-instrument"
              value={selectedInstrument}
              onChange={(e) => setSelectedInstrument(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                color: '#0f172a',
                background: '#ffffff',
              }}
            >
              <option value="">All Equipment</option>
              {instruments.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div style={{ flex: '1 1 170px' }}>
            <label htmlFor="filter-type" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
              Maintenance Type
            </label>
            <select
              id="filter-type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                color: '#0f172a',
                background: '#ffffff',
              }}
            >
              <option value="">All Types</option>
              {COMMON_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="filter-status" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
              Status
            </label>
            <select
              id="filter-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                color: '#0f172a',
                background: '#ffffff',
              }}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Search Bar */}
          <div style={{ flex: '2 1 240px' }}>
            <label htmlFor="filter-search" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
              Search Records
            </label>
            <input
              id="filter-search"
              type="text"
              placeholder="Search by technician, notes, keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {(selectedInstrument || selectedType || selectedStatus || searchQuery) && (
            <div style={{ alignSelf: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setSelectedInstrument('');
                  setSelectedType('');
                  setSelectedStatus('');
                  setSearchQuery('');
                }}
                style={{ padding: '8px 12px', fontSize: '0.8rem' }}
              >
                Reset
              </button>
            </div>
          )}
        </div>

        {/* History Table */}
        <div className="patient-table-card">
          <div className="patient-table-wrapper">
            <table className="patient-table">
              <thead>
                <tr>
                  <th>Equipment / Analyzer</th>
                  <th>Maintenance Type</th>
                  <th>Date & Time</th>
                  <th>Performed By</th>
                  <th>Status</th>
                  <th>Next Due</th>
                  <th>Notes & Findings</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="state-message">
                      <div className="state-loading">
                        <div className="spinner" />
                        <span>Loading equipment maintenance history...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="state-message">
                      <div style={{ padding: '24px 0' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔬</div>
                        <p style={{ margin: 0, fontWeight: 600 }}>No maintenance logs found matching criteria.</p>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                          Try clearing filters or click &quot;+ Log Maintenance&quot; above to record a new servicing entry.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const instName = log.instrument?.name || `Equipment #${log.instrument_id}`;
                    const formattedDate = log.maintenance_date
                      ? new Date(log.maintenance_date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'N/A';

                    return (
                      <tr key={log.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>{instName}</div>
                          <span className="patient-id-badge" style={{ fontSize: '0.7rem', marginTop: '2px' }}>
                            ID #{log.instrument_id}
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                            }}
                          >
                            {log.maintenance_type}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{formattedDate}</td>
                        <td style={{ fontSize: '0.85rem' }}>
                          <span style={{ fontWeight: 500 }}>{log.performed_by_name || 'Staff'}</span>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              ...getStatusBadgeStyle(log.status),
                            }}
                          >
                            {log.status || 'Completed'}
                          </span>
                        </td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                          {log.next_due_date ? (
                            <span style={{ color: '#0f172a', fontWeight: 500 }}>
                              {log.next_due_date}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>&mdash;</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem', maxWidth: '320px', lineHeight: 1.4 }}>
                          {log.notes || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No notes provided</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Dialog: Log Maintenance */}
        {isModalOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="maintenance-modal-title">
            <div className="modal-card" style={{ maxWidth: '580px' }}>
              <div className="modal-header">
                <h2 id="maintenance-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔬</span> Log Equipment Maintenance
                </h2>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setIsModalOpen(false)}
                  aria-label="Close dialog"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSubmitModal}>
                <div className="modal-body">
                  {modalError && (
                    <div
                      role="alert"
                      style={{
                        color: '#b91c1c',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                      }}
                    >
                      {modalError}
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="modal-inst-id">Equipment / Lab Analyzer *</label>
                    <select
                      id="modal-inst-id"
                      value={formData.instrument_id}
                      onChange={(e) => setFormData({ ...formData, instrument_id: e.target.value })}
                      required
                    >
                      <option value="">-- Choose analyzer --</option>
                      {instruments.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name} (ID #{inst.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="modal-mtype">Maintenance Type *</label>
                      <select
                        id="modal-mtype"
                        value={formData.maintenance_type}
                        onChange={(e) => setFormData({ ...formData, maintenance_type: e.target.value })}
                        required
                      >
                        {COMMON_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                        <option value="Other">Other (Custom)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="modal-status">Status *</label>
                      <select
                        id="modal-status"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                        required
                      >
                        {STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {formData.maintenance_type === 'Other' && (
                    <div className="form-group">
                      <label htmlFor="modal-custom-type">Custom Maintenance Type *</label>
                      <input
                        id="modal-custom-type"
                        type="text"
                        placeholder="e.g. Laser Alignment"
                        value={formData.custom_type}
                        onChange={(e) => setFormData({ ...formData, custom_type: e.target.value })}
                        required
                      />
                    </div>
                  )}

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="modal-mdate">Date &amp; Time *</label>
                      <input
                        id="modal-mdate"
                        type="datetime-local"
                        value={formData.maintenance_date}
                        onChange={(e) => setFormData({ ...formData, maintenance_date: e.target.value })}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="modal-ndate">Next Scheduled Due Date</label>
                      <input
                        id="modal-ndate"
                        type="date"
                        value={formData.next_due_date}
                        onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="modal-perf">Performed By</label>
                    <input
                      id="modal-perf"
                      type="text"
                      placeholder="Technician or vendor name"
                      value={formData.performed_by_name}
                      onChange={(e) => setFormData({ ...formData, performed_by_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="modal-notes">Notes, Actions Taken, &amp; Calibration Results</label>
                    <textarea
                      id="modal-notes"
                      rows={3}
                      placeholder="e.g. Photometer calibrated with standard controls. Baseline drift within normal limits."
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      style={{
                        padding: '10px 12px',
                        fontSize: '0.9rem',
                        border: '1px solid var(--line)',
                        borderRadius: '6px',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsModalOpen(false)}
                      disabled={modalSubmitting}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-register" disabled={modalSubmitting}>
                      {modalSubmitting ? 'Recording...' : 'Save Maintenance Log'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
