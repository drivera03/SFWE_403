import { useEffect, useState, useCallback } from 'react';
import { getLowStock } from '../services/inventory';
import InventoryRemovalForm from './InventoryRemovalForm';

export default function LowStockBanner() {
  const [items, setItems] = useState([]);
  const [removingItem, setRemovingItem] = useState(null);

  const fetchLowStock = useCallback(() => {
    getLowStock()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => console.warn('Could not load low-stock items:', err.message));
  }, []);

  useEffect(() => {
    fetchLowStock();
  }, [fetchLowStock]);

  const handleRemovalSuccess = () => {
    setRemovingItem(null);
    fetchLowStock();
  };

  if (items.length === 0) return null;

  return (
    <>
      <div className="low-stock-banner" role="alert">
        <strong>Low stock ({items.length})</strong>
        <ul>
          {items.map((item) => (
            <li key={item.id} style={{ margin: '4px 0' }}>
              <span>
                {item.item_name}
                {item.lot_number && ` (lot ${item.lot_number})`}: <strong>{item.quantity}</strong> left
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
                title="Remove this low-stock item"
              >
                Remove Item
              </button>
            </li>
          ))}
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
