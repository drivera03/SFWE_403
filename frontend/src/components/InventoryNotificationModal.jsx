import { useNavigate } from 'react-router-dom';

export default function InventoryNotificationModal({
  isOpen,
  onClose,
  lowStockItems = [],
  expiringItems = [],
}) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const totalCount = lowStockItems.length + expiringItems.length;
  if (totalCount === 0) return null;

  const handleGoToInventory = () => {
    onClose();
    navigate('/inventory');
  };

  const today = new Date().toISOString().split('T')[0];

  const getDaysDiff = (expDateStr) => {
    if (!expDateStr) return null;
    const diff = Math.ceil((new Date(expDateStr) - new Date(today)) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 1100 }}>
      <div className="modal-card" style={{ maxWidth: '580px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div
          className="modal-header"
          style={{
            background: '#fff7ed',
            borderBottom: '2px solid #fdba74',
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>⚠️</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', color: '#9a3412', fontWeight: 700 }}>
                Inventory Alert: Action Needed
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#c2410c' }}>
                You have {totalCount} item{totalCount === 1 ? '' : 's'} that are critically low or expiring soon.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ color: '#9a3412' }}
          >
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', padding: '18px 20px', flex: 1 }}>
          {/* Low Stock Items Section */}
          {lowStockItems.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1rem' }}>📉</span>
                <strong style={{ fontSize: '0.9rem', color: '#b45309' }}>
                  Low Stock Supplies ({lowStockItems.length})
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#78350f', background: '#fef3c7', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                  Below 20% reorder threshold
                </span>
              </div>
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                }}
              >
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {lowStockItems.map((item) => (
                    <li key={item.id} style={{ margin: '4px 0', color: '#78350f' }}>
                      <strong>{item.item_name}</strong>
                      {item.lot_number && <span> (Lot {item.lot_number})</span>}:{' '}
                      <span style={{ fontWeight: 700, color: '#b91c1c' }}>{item.quantity} left</span>
                      <span style={{ color: '#92400e', fontSize: '0.75rem', marginLeft: '6px' }}>
                        (Reorder at {item.reorder_threshold})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Expiring Items Section */}
          {expiringItems.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1rem' }}>⏳</span>
                <strong style={{ fontSize: '0.9rem', color: '#9a3412' }}>
                  Expiring / Expired Items ({expiringItems.length})
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#7c2d12', background: '#ffedd5', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fed7aa' }}>
                  Within 30 days or past date
                </span>
              </div>
              <div
                style={{
                  background: '#fff7ed',
                  border: '1px solid #fdba74',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                }}
              >
                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                  {expiringItems.map((item) => {
                    const daysLeft = getDaysDiff(item.expiration_date);
                    const isExpired = daysLeft !== null && daysLeft <= 0;

                    return (
                      <li key={item.id} style={{ margin: '4px 0', color: '#7c2d12' }}>
                        <strong>{item.item_name}</strong>
                        {item.lot_number && <span> (Lot {item.lot_number})</span>}:{' '}
                        <span>{item.quantity} units</span> &bull; Exp: {item.expiration_date || 'N/A'}{' '}
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            marginLeft: '4px',
                            background: isExpired ? '#fee2e2' : '#fed7aa',
                            color: isExpired ? '#991b1b' : '#9a3412',
                            border: `1px solid ${isExpired ? '#fca5a5' : '#fdba74'}`,
                          }}
                        >
                          {isExpired ? 'EXPIRED' : `${daysLeft}d left`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div
          className="modal-actions"
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            margin: 0,
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ fontSize: '0.85rem', padding: '8px 14px' }}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="btn-register"
            onClick={handleGoToInventory}
            style={{
              background: '#ab0520',
              fontSize: '0.85rem',
              padding: '8px 16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📦</span> Go to Inventory &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
