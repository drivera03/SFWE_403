import { useState } from 'react';
import { importHL7Results, apiErrorMessage } from '../services/tests';

export default function HL7ImportModal({ isOpen, onClose, onImportComplete }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setContent(event.target?.result || '');
    };
    reader.readAsText(file);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Please provide or upload HL7-lite text content.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSummary(null);
      const res = await importHL7Results(content.trim());
      setSummary(res);
      if (onImportComplete) onImportComplete(res);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to import and merge HL7 results.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          maxWidth: '560px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>🧬</span>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700 }}>
              Import Analyzer Results (HL7-lite)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              color: '#64748b',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '16px' }}>
          Upload or paste an automated analyzer text file. Barcodes are matched to test orders,
          completed with numerical values, and duplicate records are audited and skipped.
        </p>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        {summary ? (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 6px 0', color: '#166534', fontSize: '0.95rem' }}>
                ✓ Import Complete
              </h4>
              <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: '#15803d' }}>
                <span><strong>Total:</strong> {summary.total_records}</span>
                <span><strong>Merged:</strong> {summary.merged_count}</span>
                <span><strong>Duplicates:</strong> {summary.duplicate_count}</span>
                <span><strong>Unmatched:</strong> {summary.unmatched_count}</span>
              </div>
            </div>

            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px', marginBottom: '16px', fontSize: '0.8rem' }}>
              {summary.results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    padding: '6px 8px',
                    borderBottom: i < summary.results.length - 1 ? '1px solid #f1f5f9' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <code style={{ fontWeight: 700, color: '#0369a1' }}>{r.barcode}</code>
                    <span style={{ marginLeft: '8px', color: '#475569' }}>{r.test_name || r.message || ''}</span>
                  </div>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      background:
                        r.status === 'merged'
                          ? '#dcfce7'
                          : r.status === 'duplicate'
                          ? '#fef3c7'
                          : '#fee2e2',
                      color:
                        r.status === 'merged'
                          ? '#15803d'
                          : r.status === 'duplicate'
                          ? '#b45309'
                          : '#b91c1c',
                    }}
                  >
                    {r.status.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSummary(null);
                  setContent('');
                  onClose();
                }}
                style={{ padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600 }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleImport}>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Upload .txt file from analyzer:
              </label>
              <input
                type="file"
                accept=".txt,.hl7,.dat"
                onChange={handleFileUpload}
                style={{ fontSize: '0.85rem', color: '#475569' }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                  Or paste raw HL7-lite / BARCODE text:
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setContent(
                      'BARCODE|BC-SMP-001|Complete Blood Count|14.2|g/dL|completed|Normal range\nBARCODE|BC-SMP-002|Lipid Panel|188.5|mg/dL|completed|Desirable'
                    )
                  }
                  style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Insert Sample
                </button>
              </div>
              <textarea
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="BARCODE|<barcode>|<test_name>|<result>|<units>|<status>"
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0284c7',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {loading ? 'Merging Results...' : 'Import & Merge Results'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
