import { useState } from 'react';
import { createPurchase, apiErrorMessage } from '../services/tests';

export default function PointOfSaleModal({ isOpen, onClose, patient = null, onPurchaseComplete }) {
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [items, setItems] = useState([
    { description: 'Complete Blood Count (CBC)', amount: '45.00' },
  ]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);

  if (!isOpen) return null;

  const totalAmount = items.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);

  const handleAddItem = () => {
    setItems((prev) => [...prev, { description: '', amount: '0.00' }]);
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.length === 0) {
      setError('At least one line item is required.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const payload = {
        patient_id: patient?.id || null,
        payment_method: paymentMethod,
        items: items.map((it) => ({
          description: it.description || 'Lab Service',
          amount: parseFloat(it.amount) || 0,
        })),
        notes: notes.trim() || null,
      };

      const res = await createPurchase(payload);
      setReceipt(res);
      if (onPurchaseComplete) onPurchaseComplete(res);
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to complete point-of-sale transaction.'));
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
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
          maxWidth: '540px',
          width: '100%',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>🧾</span>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a', fontWeight: 700 }}>
              Point of Sale Checkout &amp; Receipt
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

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '14px' }}>
            {error}
          </div>
        )}

        {receipt ? (
          <div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', color: '#166534', fontSize: '0.85rem', marginBottom: '16px' }}>
              ✓ Purchase completed successfully. Receipt generated.
            </div>

            <pre
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '16px',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: '#0f172a',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                marginBottom: '16px',
              }}
            >
              {receipt.formatted_receipt}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setReceipt(null);
                  onClose();
                }}
                style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontWeight: 600 }}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrint}
                style={{ padding: '8px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>🖨️ Print Receipt</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Patient Account:</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                {patient ? `${patient.first_name} ${patient.last_name} (ID: #${patient.id})` : 'Walk-In / Self-Pay'}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Line Items</label>
                <button
                  type="button"
                  onClick={handleAddItem}
                  style={{ background: 'none', border: 'none', color: '#0284c7', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  + Add Item
                </button>
              </div>

              {items.map((item, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="Service description"
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    style={{ flex: 2, padding: '6px 10px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={item.amount}
                    onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                    style={{ width: '90px', padding: '6px 10px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    required
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', padding: '0 4px' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}

              <div style={{ textAlign: 'right', marginTop: '10px', fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                Total: ${totalAmount.toFixed(2)}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Payment Method:
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
              >
                <option value="credit_card">Credit Card (POS Terminal)</option>
                <option value="debit_card">Debit Card</option>
                <option value="cash">Cash</option>
                <option value="insurance">Insurance Co-Pay</option>
                <option value="check">Check</option>
              </select>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                Transaction Notes:
              </label>
              <input
                type="text"
                placeholder="Optional notes or authorization code"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
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
                  background: '#059669',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {loading ? 'Processing...' : `Charge $${totalAmount.toFixed(2)} & Print Receipt`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
