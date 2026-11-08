import { useEffect, useState } from 'react';
import { getLowStock } from '../services/inventory';

export default function LowStockBanner() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    getLowStock()
      .then(setItems)
      .catch((err) => console.warn('Could not load low-stock items:', err.message));
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="low-stock-banner" role="alert">
      <strong>Low stock ({items.length})</strong>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.item_name}
            {item.lot_number && ` (lot ${item.lot_number})`}: {item.quantity} left
          </li>
        ))}
      </ul>
    </div>
  );
}