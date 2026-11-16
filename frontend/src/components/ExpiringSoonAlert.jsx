import { useEffect, useState } from 'react';
import { getExpiring } from '../services/inventory';
import InventoryRemovalForm from './InventoryRemovalForm';

export default function ExpiringSoonAlert() {
  const [items, setItems] = useState([]);
  const [days, setDays] = useState(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [removingItem, setRemovingItem] = useState(null);

  useEffect(() => {
    let ignore = false;
    getExpiring(days)
      .then((data) => {
        if (!ignore) {
          setItems(Array.isArray(data) ? data : []);
        }
      })
      .catch((err) => {
        console.warn('Could not load expiring items:', err.message);
      });
    return () => {
      ignore = true;
    };
  }, [days, refreshKey]);

  const handleRemovalSuccess = () => {
    setRemovingItem(null);
    setRefreshKey((k) => k + 1);
  };

  const today = new Date().toISOString().split('T')[0];

  const getDaysDiff = (expDateStr) => {
    if (!expDateStr) return null;
    const diff = Math.ceil((new Date(expDateStr) - new Date(today)) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (items.length === 0) return null;

  return (
    <>
      <div className="expiring-soon-banner" role="alert" style={{
        background: '#fff7ed',
        border: '1px solid #fdba74',
        borderRadius: '8px',
        padding: '14px 18px',
        margin: '16px 0',
        color: '#9a3412',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <strong style={{ fontSize: '0.95rem' }}>
              Expiring or Expired Inventory ({items.length})
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            <label htmlFor="expiring-days-select" style={{ fontWeight: 500 }}>Window:</label>
            <select
              id="expiring-days-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                padding: '3px 8px',
                borderRadius: '4px',
                border: '1px solid #fb923c',
                background: '#ffffff',
                color: '#9a3412',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <option value={15}>Next 15 days</option>
              <option value={30}>Next 30 days (default)</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
            </select>
          </div>
        </div>

        <ul style={{ margin: '10px 0 4px', paddingLeft: '20px', listStyleType: 'disc' }}>
          {items.map((item) => {
            const daysLeft = getDaysDiff(item.expiration_date);
            const isExpired = daysLeft !== null && daysLeft <= 0;

            return (
              <li key={item.id} style={{ margin: '6px 0', fontSize: '0.875rem' }}>
                <span style={{ fontWeight: 600 }}>{item.item_name}</span>
                {item.lot_number && <span> (lot {item.lot_number})</span>}:{' '}
                <span>{item.quantity} units</span> &bull; Exp: {item.expiration_date || 'N/A'}
                {' '}
                <span
                  style={{
                    display: 'inline-block',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    marginLeft: '6px',
                    background: isExpired ? '#fee2e2' : '#fed7aa',
                    color: isExpired ? '#991b1b' : '#9a3412',
                    border: `1px solid ${isExpired ? '#fca5a5' : '#fdba74'}`,
                  }}
                >
                  {isExpired ? (daysLeft === 0 ? 'EXPIRES TODAY' : 'EXPIRED') : `${daysLeft} days left`}
                </span>
                <button
                  type="button"
                  onClick={() => setRemovingItem(item)}
                  style={{
                    marginLeft: '10px',
                    background: '#ab0520',
                    color: '#ffffff',
                    border: 'none',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Remove this expired/expiring item"
                >
                  Remove Item
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {removingItem && (
        <InventoryRemovalForm
          initialItemId={removingItem.id}
          initialItemName={removingItem.item_name}
          isModal={true}
          onSuccess={handleRemovalSuccess}
          onCancel={() => setRemovingItem(null)}
        />
      )}
    </>
  );
}
