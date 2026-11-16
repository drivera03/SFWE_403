import { useState, useEffect } from 'react';
import { getInventory, removeInventoryItem } from '../services/inventory';

const PRESET_REASONS = [
  'Expired lot',
  'Damaged packaging',
  'Contamination suspected',
  'Manufacturer recall',
  'Depleted / consumed',
  'Quality control failure',
];

export default function InventoryRemovalForm({
  initialItemId = '',
  initialItemName = '',
  onSuccess,
  onCancel,
  isModal = false,
}) {
  const [itemId, setItemId] = useState(initialItemId ? String(initialItemId) : '');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);

  useEffect(() => {
    let ignore = false;
    getInventory()
      .then((data) => {
        if (!ignore && Array.isArray(data)) {
          setItems(data);
        }
      })
      .catch((err) => {
        console.warn('Could not load inventory items list:', err.message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const selectedItem = items.find((i) => String(i.id) === String(itemId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!itemId) {
      setError('Please select or specify an inventory item to remove.');
      return;
    }
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError('A valid reason is required for inventory removal (ConOps 6.4.7).');
      return;
    }
    if (trimmedReason.length > 500) {
      setError('Reason must be 500 characters or fewer.');
      return;
    }

    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await removeInventoryItem(Number(itemId), trimmedReason);
      setSuccessMsg(`Successfully removed item #${itemId} (${selectedItem?.item_name || initialItemName || 'Inventory item'}).`);
      setReason('');
      setConfirmStep(false);
      if (onSuccess) {
        onSuccess(Number(itemId));
      }
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Failed to remove inventory item.');
      setConfirmStep(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <div className="inventory-removal-card" style={{ background: '#ffffff', borderRadius: '10px', padding: '20px', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ab0520' }}>🗑️</span> Remove Inventory Item
        </h3>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#64748b' }}
            aria-label="Close"
          >
            &times;
          </button>
        )}
      </div>

      <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#64748b' }}>
        ConOps 6.4.7: Lab Managers must log who removed the item, when, and the reason for removal.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            color: '#b91c1c',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            marginBottom: '14px',
          }}
        >
          {error}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          style={{
            color: '#15803d',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            padding: '10px 14px',
            borderRadius: '6px',
            fontSize: '0.85rem',
            marginBottom: '14px',
          }}
        >
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} id="inventory-removal-form">
        <div style={{ marginBottom: '14px' }}>
          <label htmlFor="inventory-item-select" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Select Inventory Item *
          </label>
          {items.length > 0 ? (
            <select
              id="inventory-item-select"
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                setConfirmStep(false);
                setError('');
              }}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
                color: '#0f172a',
                background: '#ffffff',
              }}
            >
              <option value="">-- Choose an item to remove --</option>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  #{it.id}: {it.item_name} {it.lot_number ? `(Lot: ${it.lot_number})` : ''} — Qty: {it.quantity}
                  {it.expiration_date ? ` [Exp: ${it.expiration_date}]` : ''}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="inventory-item-select"
              type="number"
              placeholder="Enter Item ID (e.g. 1)"
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                setConfirmStep(false);
                setError('');
              }}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.9rem',
              }}
            />
          )}
        </div>

        {selectedItem && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '10px 14px',
              fontSize: '0.85rem',
              marginBottom: '14px',
              color: '#334155',
            }}
          >
            <div><strong>Item:</strong> {selectedItem.item_name}</div>
            {selectedItem.lot_number && <div><strong>Lot Number:</strong> {selectedItem.lot_number}</div>}
            {selectedItem.batch_number && <div><strong>Batch:</strong> {selectedItem.batch_number}</div>}
            <div><strong>Current Stock:</strong> {selectedItem.quantity} units</div>
            {selectedItem.expiration_date && (
              <div><strong>Expiration:</strong> {selectedItem.expiration_date}</div>
            )}
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <label htmlFor="removal-reason" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
            Reason for Removal *
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {PRESET_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setReason(preset);
                  setConfirmStep(false);
                }}
                style={{
                  background: reason === preset ? '#ab0520' : '#f1f5f9',
                  color: reason === preset ? '#ffffff' : '#334155',
                  border: '1px solid',
                  borderColor: reason === preset ? '#8a0419' : '#cbd5e1',
                  borderRadius: '16px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: reason === preset ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            id="removal-reason"
            rows={3}
            placeholder="Specify reason (required, max 500 characters)..."
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setConfirmStep(false);
              setError('');
            }}
            maxLength={500}
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
              color: '#0f172a',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
            {reason.length} / 500 chars
          </div>
        </div>

        {confirmStep && (
          <div
            style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '14px',
              fontSize: '0.85rem',
              color: '#92400e',
            }}
          >
            <strong>Are you sure?</strong> This will permanently delete item #{itemId} from inventory and record this action in the activity log.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          {onCancel && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || !itemId || !reason.trim()}
            style={{
              background: confirmStep ? '#b91c1c' : '#ab0520',
              color: '#ffffff',
              border: 'none',
              padding: '9px 18px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: isSubmitting || !itemId || !reason.trim() ? 'not-allowed' : 'pointer',
              opacity: isSubmitting || !itemId || !reason.trim() ? 0.6 : 1,
              transition: 'background 0.2s',
            }}
          >
            {isSubmitting
              ? 'Removing...'
              : confirmStep
              ? 'Yes, Confirm Removal'
              : 'Remove Item'}
          </button>
        </div>
      </form>
    </div>
  );

  if (isModal) {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true">
        <div className="modal-card" style={{ maxWidth: '540px' }}>
          {formContent}
        </div>
      </div>
    );
  }

  return formContent;
}
