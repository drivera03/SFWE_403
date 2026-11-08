import { useState } from 'react';
import { lookupLot } from '../services/inventory';
import { apiErrorMessage } from '../services/tests';

export default function LotLookup() {
  const [number, setNumber] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!number.trim()) return;
    setError('');
    try {
      setResult(await lookupLot(number.trim()));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <div className="lot-lookup">
      <form onSubmit={handleSearch}>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="Batch or lot number"
        />
        <button type="submit">Search</button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <h4>Items ({result.items.length})</h4>
          <ul>
            {result.items.map((item) => (
              <li key={item.id}>
                {item.item_name}: {item.quantity} left, expires {item.expiration_date || 'n/a'}
              </li>
            ))}
          </ul>
          <h4>Related tests ({result.tests.length})</h4>
          <ul>
            {result.tests.map((test) => (
              <li key={test.id}>
                {test.report_id}: {test.test_name} (patient {test.patient_id})
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}