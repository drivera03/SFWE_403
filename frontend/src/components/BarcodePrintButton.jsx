import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { generateBarcode, getTestBarcode, apiErrorMessage } from '../services/tests';

/**
 * BarcodePrintButton with strict one-time-use disable policy (SXFT5-175).
 * Only specimen collectors may generate/print specimen barcodes.
 * Staff can view the barcode again if not yet printed.
 */
export default function BarcodePrintButton({
  testId,
  barcodePrinted = false,
  barcode = null,
  sampleId = '',
  testName = '',
  patientName = '',
  onPrinted = null,
  size = 'normal', // 'normal' | 'small'
}) {
  const { currentUser } = useAuth() || {};
  const role = currentUser?.role?.toLowerCase() || '';
  const isCollector = role === 'specimen_collector' || role === 'lab_manager' || role === 'manager';

  const [isPrinted, setIsPrinted] = useState(Boolean(barcodePrinted));
  const [currentBarcode, setCurrentBarcode] = useState(barcode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [printData, setPrintData] = useState(null);

  useEffect(() => {
    setIsPrinted(Boolean(barcodePrinted));
  }, [barcodePrinted]);

  useEffect(() => {
    if (barcode) {
      setCurrentBarcode(barcode);
    }
  }, [barcode]);

  const handlePrint = async () => {
    if (isPrinted || loading) return;

    if (!isCollector) {
      setError('Only Specimen Collectors are authorized to generate and print barcodes.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const data = await generateBarcode(testId);
      setIsPrinted(true);
      setCurrentBarcode(data.barcode);
      setPrintData(data);
      setShowModal(true);
      if (onPrinted) onPrinted(data);
    } catch (err) {
      if (err.response?.status === 409) {
        setIsPrinted(true);
        setError('Barcode has already been generated and printed for this test (one-time print policy).');
      } else {
        setError(apiErrorMessage(err, 'Failed to generate barcode.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleViewBarcode = async () => {
    setError('');
    if (printData && (printData.barcode || currentBarcode)) {
      setShowModal(true);
      return;
    }

    try {
      setLoading(true);
      const data = await getTestBarcode(testId);
      setPrintData(data);
      if (data?.barcode) {
        setCurrentBarcode(data.barcode);
      }
      setShowModal(true);
    } catch (err) {
      if (currentBarcode || barcode) {
        setPrintData({
          test_id: testId,
          barcode: currentBarcode || barcode,
          sample_id: sampleId,
          test_name: testName,
          patient_name: patientName,
          barcode_printed: true,
        });
        setShowModal(true);
      } else {
        setError(apiErrorMessage(err, 'Failed to retrieve barcode label.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  // Generate SVG barcode representation (Code-128 / stripes pattern)
  const renderBarcodePattern = (code) => {
    const chars = (code || sampleId || 'BC-000000').split('');
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '52px', gap: '2px', padding: '4px 0' }}>
        {chars.map((char, idx) => {
          const charCode = char.charCodeAt(0);
          const width = (charCode % 3) + 1.8;
          const space = (charCode % 2) + 1;
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                height: '100%',
                gap: `${space}px`,
              }}
            >
              <div
                style={{
                  width: `${width}px`,
                  height: '100%',
                  background: '#0f172a',
                }}
              />
              <div
                style={{
                  width: `${(charCode % 2) + 1.2}px`,
                  height: '85%',
                  background: '#0f172a',
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
        {isPrinted ? (
          <button
            type="button"
            onClick={handleViewBarcode}
            id={`barcode-print-btn-${testId}`}
            title="Barcode already generated. Click to view label or print again."
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: size === 'small' ? '4px 10px' : '6px 14px',
              fontSize: size === 'small' ? '0.78rem' : '0.85rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #0284c7',
              background: '#f0f9ff',
              color: '#0369a1',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span>👁️</span>
            <span>View Barcode</span>
            <span style={{ fontSize: '0.85rem', color: '#16a34a', marginLeft: '2px' }}>✓</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || !isCollector}
            title={
              !isCollector
                ? 'Only Specimen Collectors may print sample barcodes.'
                : 'Print specimen tube barcode label (one-time generation)'
            }
            id={`barcode-print-btn-${testId}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: size === 'small' ? '4px 8px' : '6px 14px',
              fontSize: size === 'small' ? '0.78rem' : '0.85rem',
              fontWeight: 600,
              borderRadius: '6px',
              border: '1px solid #0284c7',
              background: loading ? '#93c5fd' : '#0284c7',
              color: '#ffffff',
              cursor: !isCollector ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              opacity: !isCollector ? 0.65 : 1,
            }}
          >
            {loading ? (
              <>
                <span className="spinner-small" style={{ width: '12px', height: '12px' }} />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '1rem' }}>🖨️</span>
                <span>Print Barcode</span>
              </>
            )}
          </button>
        )}

        {error && (
          <span style={{ fontSize: '0.72rem', color: '#b91c1c', maxWidth: '240px' }}>
            {error}
          </span>
        )}
      </div>

      {/* Printable Barcode Label Modal */}
      {showModal && (
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
              maxWidth: '460px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.4rem' }}>🏷️</span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', fontWeight: 700 }}>
                  Specimen Tube Barcode Label
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
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

            <div
              className="printable-barcode-label"
              style={{
                border: '2px dashed #94a3b8',
                borderRadius: '8px',
                padding: '16px',
                background: '#f8fafc',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.5px', color: '#475569', textTransform: 'uppercase' }}>
                CLMS Clinical Laboratory
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
                {testName || 'Laboratory Specimen'}
              </div>

              {/* Barcode Graphic */}
              <div style={{ margin: '10px 0', background: '#ffffff', padding: '8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                {renderBarcodePattern(currentBarcode || printData?.barcode)}
                <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', letterSpacing: '2px', marginTop: '4px' }}>
                  {currentBarcode || printData?.barcode}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left', fontSize: '0.78rem', color: '#334155', marginTop: '8px' }}>
                <div>
                  <strong>Sample ID:</strong> <code>{sampleId || printData?.sample_id}</code>
                </div>
                <div>
                  <strong>Test ID:</strong> #{testId}
                </div>
                <div>
                  <strong>Patient:</strong> {patientName || `ID #${printData?.patient_id || '—'}`}
                </div>
                <div>
                  <strong>Sample Type:</strong> {(printData?.sample_type || 'BLOOD').toUpperCase()}
                </div>
              </div>

              <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#64748b', borderTop: '1px solid #e2e8f0', paddingTop: '6px' }}>
                {printData?.barcode_printed_at ? `Generated/Printed: ${new Date(printData.barcode_printed_at).toLocaleString()}` : `Generated: ${new Date().toLocaleString()}`} • Authorized Specimen Tube Label
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleBrowserPrint}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#0284c7',
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>🖨️ Send to Label Printer</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
