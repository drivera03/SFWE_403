import { useState, useEffect, useMemo } from 'react';
import Navbar from '../components/Navbar';
import LowStockBanner from '../components/LowStockBanner';
import ExpiringSoonAlert from '../components/ExpiringSoonAlert';
import LotLookup from '../components/LotLookup';
import InventoryRemovalForm from '../components/InventoryRemovalForm';
import HL7ImportModal from '../components/HL7ImportModal';
import { getInventory, receiveSupplies, getLowStock, getExpiring } from '../services/inventory';
import { getInstruments } from '../services/tests';
import '../styles/patients.css';

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'alerts', 'remove', 'receive', 'lookup'
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals
  const [isRemovalModalOpen, setIsRemovalModalOpen] = useState(false);
  const [itemToRemove, setItemToRemove] = useState(null);
  const [isHL7ModalOpen, setIsHL7ModalOpen] = useState(false);

  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [receiveItem, setReceiveItem] = useState(null);
  const [receiveForm, setReceiveForm] = useState({
    item_name: '',
    quantity: '',
    lot_number: '',
    batch_number: '',
    expiration_date: '',
    reorder_threshold: '10',
    machine_id: '',
  });
  const [receiveError, setReceiveError] = useState('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveSuccess, setReceiveSuccess] = useState('');

  // Counts for tabs
  const [lowStockCount, setLowStockCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const [invData, instList, lowData, expData] = await Promise.all([
          getInventory(search),
          getInstruments(),
          getLowStock().catch(() => []),
          getExpiring(30).catch(() => []),
        ]);
        if (!ignore) {
          setItems(Array.isArray(invData) ? invData : []);
          setInstruments(Array.isArray(instList) ? instList : []);
          setLowStockCount(Array.isArray(lowData) ? lowData.length : 0);
          setExpiringCount(Array.isArray(expData) ? expData.length : 0);
          setLoading(false);
        }
      } catch (err) {
        console.warn('Failed to load inventory:', err.message);
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, [search, refreshKey]);

  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalUnits = items.reduce((acc, it) => acc + (it.quantity || 0), 0);
    return { totalItems, totalUnits, lowStockCount, expiringCount };
  }, [items, lowStockCount, expiringCount]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (it) =>
        it.item_name?.toLowerCase().includes(q) ||
        it.lot_number?.toLowerCase().includes(q) ||
        it.batch_number?.toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleOpenReceiveModal = (prefillItem = null) => {
    setReceiveError('');
    setReceiveSuccess('');
    if (prefillItem) {
      setReceiveItem(prefillItem);
      setReceiveForm({
        item_id: prefillItem.id,
        item_name: prefillItem.item_name,
        quantity: '',
        lot_number: prefillItem.lot_number || '',
        batch_number: prefillItem.batch_number || '',
        expiration_date: prefillItem.expiration_date || '',
        reorder_threshold: prefillItem.reorder_threshold ? String(prefillItem.reorder_threshold) : '10',
        machine_id: prefillItem.machine_id ? String(prefillItem.machine_id) : '',
      });
    } else {
      setReceiveItem(null);
      setReceiveForm({
        item_name: '',
        quantity: '',
        lot_number: '',
        batch_number: '',
        expiration_date: '',
        reorder_threshold: '10',
        machine_id: '',
      });
    }
    setIsReceiveModalOpen(true);
  };

  const handleReceiveSubmit = async (e) => {
    e.preventDefault();
    setReceiveError('');
    setReceiveSuccess('');
    const qty = parseInt(receiveForm.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setReceiveError('Quantity received must be a positive integer.');
      return;
    }
    if (!receiveForm.item_name.trim()) {
      setReceiveError('Item name is required.');
      return;
    }

    setReceiveSubmitting(true);
    try {
      const payload = {
        item_name: receiveForm.item_name.trim(),
        quantity: qty,
        lot_number: receiveForm.lot_number.trim() || undefined,
        batch_number: receiveForm.batch_number.trim() || undefined,
        expiration_date: receiveForm.expiration_date || undefined,
        reorder_threshold: receiveForm.reorder_threshold ? parseInt(receiveForm.reorder_threshold, 10) : 0,
        machine_id: receiveForm.machine_id ? parseInt(receiveForm.machine_id, 10) : undefined,
      };
      if (receiveItem?.id) {
        payload.item_id = receiveItem.id;
      }

      await receiveSupplies(payload);
      setReceiveSuccess(`Successfully received ${qty} units of "${payload.item_name}"!`);
      setRefreshKey((k) => k + 1);
      setTimeout(() => {
        setIsReceiveModalOpen(false);
      }, 1000);
    } catch (err) {
      setReceiveError(err?.response?.data?.detail || err.message || 'Failed to receive supplies.');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const handleOpenRemoval = (item = null) => {
    setItemToRemove(item);
    setIsRemovalModalOpen(true);
  };

  const handleRemovalSuccess = () => {
    setIsRemovalModalOpen(false);
    setItemToRemove(null);
    setRefreshKey((k) => k + 1);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="patient-page">
      <Navbar />

      <div className="patient-container" style={{ maxWidth: '1150px', margin: '30px auto', padding: '0 20px' }}>
        {/* Header */}
        <div className="patient-header" style={{ marginBottom: '20px' }}>
          <div className="patient-header-title">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#ab0520' }}>📦</span> Inventory &amp; Supplies
            </h1>
            <p>Monitor stock quantities, lot numbers, receive new supply shipments, and log inventory removals with verified reasons.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn-register"
              onClick={() => handleOpenReceiveModal()}
              style={{ background: '#059669', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>📥</span> Receive Supplies
            </button>
            <button
              type="button"
              className="btn-register"
              onClick={() => setIsHL7ModalOpen(true)}
              style={{ background: '#0284c7', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Import HL7-lite automated analyzer results"
            >
              <span>🧬</span> Import Analyzer Results
            </button>
            <button
              type="button"
              className="btn-register"
              onClick={() => handleOpenRemoval()}
              style={{ background: '#ab0520', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <span>🗑️</span> Remove Item
            </button>
          </div>
        </div>

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
              Distinct Reagent Lots
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0c234b', marginTop: '4px' }}>
              {stats.totalItems}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Inventory tracked batches</div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Total Units On Hand
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>
              {stats.totalUnits}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#15803d', marginTop: '2px' }}>Tubes, strips, &amp; reagent kits</div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Low Stock Alerts
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: stats.lowStockCount > 0 ? '#b45309' : '#15803d', marginTop: '4px' }}>
              {stats.lowStockCount}
            </div>
            <div style={{ fontSize: '0.75rem', color: stats.lowStockCount > 0 ? '#b45309' : '#15803d', marginTop: '2px' }}>
              {stats.lowStockCount > 0 ? 'Below 20% reorder threshold' : 'All supplies adequate'}
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Expiring Soon (&lt;30d)
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: stats.expiringCount > 0 ? '#dc2626' : '#15803d', marginTop: '4px' }}>
              {stats.expiringCount}
            </div>
            <div style={{ fontSize: '0.75rem', color: stats.expiringCount > 0 ? '#dc2626' : '#15803d', marginTop: '2px' }}>
              {stats.expiringCount > 0 ? 'Action or disposal needed' : 'No supplies expiring'}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', marginBottom: '20px', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'all' ? '3px solid #ab0520' : '3px solid transparent',
              padding: '10px 16px',
              fontWeight: activeTab === 'all' ? 700 : 500,
              color: activeTab === 'all' ? '#ab0520' : '#64748b',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            All Inventory ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'alerts' ? '3px solid #ab0520' : '3px solid transparent',
              padding: '10px 16px',
              fontWeight: activeTab === 'alerts' ? 700 : 500,
              color: activeTab === 'alerts' ? '#ab0520' : '#64748b',
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚠️</span> Alerts ({stats.lowStockCount + stats.expiringCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('remove')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'remove' ? '3px solid #ab0520' : '3px solid transparent',
              padding: '10px 16px',
              fontWeight: activeTab === 'remove' ? 700 : 500,
              color: activeTab === 'remove' ? '#ab0520' : '#64748b',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Removal Form (with Reason)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('receive')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'receive' ? '3px solid #ab0520' : '3px solid transparent',
              padding: '10px 16px',
              fontWeight: activeTab === 'receive' ? 700 : 500,
              color: activeTab === 'receive' ? '#ab0520' : '#64748b',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Receive Supplies Form
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lookup')}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'lookup' ? '3px solid #ab0520' : '3px solid transparent',
              padding: '10px 16px',
              fontWeight: activeTab === 'lookup' ? 700 : 500,
              color: activeTab === 'lookup' ? '#ab0520' : '#64748b',
              fontSize: '0.95rem',
              cursor: 'pointer',
            }}
          >
            Lot / Batch Lookup
          </button>
        </div>

        {/* TAB 1: ALL INVENTORY TABLE */}
        {activeTab === 'all' && (
          <div>
            {/* Search bar */}
            <div style={{ marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search by item name, lot number, or batch number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.9rem',
                }}
              />
              {search && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSearch('')}
                  style={{ padding: '9px 14px' }}
                >
                  Clear
                </button>
              )}
            </div>

            <div className="patient-table-card">
              <div className="patient-table-wrapper">
                <table className="patient-table">
                  <thead>
                    <tr>
                      <th>Item / Reagent</th>
                      <th>Lot &amp; Batch</th>
                      <th>Current Quantity</th>
                      <th>Reorder Level</th>
                      <th>Expiration</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="state-message">
                          <div className="state-loading">
                            <div className="spinner" />
                            <span>Loading inventory records...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="state-message">
                          <div style={{ padding: '24px 0' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📦</div>
                            <p style={{ margin: 0, fontWeight: 600 }}>No inventory items found.</p>
                            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                              Click &quot;Receive Supplies&quot; above to log new inventory shipments.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => {
                        const isLow = item.quantity < (item.reorder_threshold || 0) * 0.2;
                        const isExpired = item.expiration_date && item.expiration_date <= today;

                        return (
                          <tr key={item.id}>
                            <td>
                              <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.item_name}</div>
                              <span className="patient-id-badge" style={{ fontSize: '0.7rem' }}>
                                ID #{item.id}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>
                              <div><strong>Lot:</strong> {item.lot_number || 'None'}</div>
                              {item.batch_number && <div style={{ color: '#64748b' }}>Batch: {item.batch_number}</div>}
                            </td>
                            <td>
                              <span
                                style={{
                                  fontSize: '1rem',
                                  fontWeight: 700,
                                  color: isLow ? '#b45309' : '#0f172a',
                                }}
                              >
                                {item.quantity}
                              </span>{' '}
                              units
                            </td>
                            <td style={{ fontSize: '0.85rem', color: '#64748b' }}>
                              {item.reorder_threshold || 0}
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>
                              {item.expiration_date ? (
                                <span style={{ color: isExpired ? '#b91c1c' : '#0f172a', fontWeight: isExpired ? 700 : 400 }}>
                                  {item.expiration_date}
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>N/A</span>
                              )}
                            </td>
                            <td>
                              {isExpired ? (
                                <span
                                  style={{
                                    background: '#fee2e2',
                                    color: '#b91c1c',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    border: '1px solid #fca5a5',
                                  }}
                                >
                                  EXPIRED
                                </span>
                              ) : isLow ? (
                                <span
                                  style={{
                                    background: '#fef3c7',
                                    color: '#b45309',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    border: '1px solid #fde68a',
                                  }}
                                >
                                  LOW STOCK
                                </span>
                              ) : (
                                <span
                                  style={{
                                    background: '#dcfce7',
                                    color: '#15803d',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    border: '1px solid #bbf7d0',
                                  }}
                                >
                                  In Stock
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenReceiveModal(item)}
                                style={{
                                  background: '#f1f5f9',
                                  border: '1px solid #cbd5e1',
                                  color: '#0f172a',
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  marginRight: '6px',
                                }}
                                title="Receive more units of this item"
                              >
                                + Receive
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenRemoval(item)}
                                style={{
                                  background: '#fee2e2',
                                  border: '1px solid #fca5a5',
                                  color: '#b91c1c',
                                  padding: '4px 10px',
                                  borderRadius: '4px',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                                title="Remove with reason"
                              >
                                🗑️ Remove
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ALERTS VIEW */}
        {activeTab === 'alerts' && (
          <div>
            <LowStockBanner />
            <ExpiringSoonAlert />
          </div>
        )}

        {/* TAB 3: STANDALONE REMOVAL FORM VIEW (SXFT5-188) */}
        {activeTab === 'remove' && (
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            <InventoryRemovalForm
              onSuccess={() => {
                setRefreshKey((k) => k + 1);
              }}
            />
          </div>
        )}

        {/* TAB 4: RECEIVE SUPPLIES FORM VIEW (SXFT5-181) */}
        {activeTab === 'receive' && (
          <div style={{ maxWidth: '680px', margin: '0 auto' }}>
            <div className="intake-section-box">
              <h2 className="intake-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📥</span> Receive New Supplies
              </h2>
              <p className="intake-section-desc">Record newly arrived shipments, reagents, tubes, and test kits.</p>

              {receiveError && (
                <div role="alert" className="state-error" style={{ borderRadius: '6px', margin: '14px 0' }}>
                  {receiveError}
                </div>
              )}
              {receiveSuccess && (
                <div role="status" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '6px', margin: '14px 0' }}>
                  {receiveSuccess}
                </div>
              )}

              <form onSubmit={handleReceiveSubmit}>
                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label htmlFor="tab-receive-name">Supply Item Name *</label>
                  <input
                    id="tab-receive-name"
                    type="text"
                    required
                    placeholder="e.g. Lipid Reagent Kit, Serum Tube"
                    value={receiveForm.item_name}
                    onChange={(e) => setReceiveForm({ ...receiveForm, item_name: e.target.value })}
                  />
                </div>

                <div className="form-row" style={{ marginBottom: '14px' }}>
                  <div className="form-group">
                    <label htmlFor="tab-receive-qty">Quantity Received *</label>
                    <input
                      id="tab-receive-qty"
                      type="number"
                      required
                      min={1}
                      placeholder="e.g. 50"
                      value={receiveForm.quantity}
                      onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="tab-receive-threshold">Reorder Threshold</label>
                    <input
                      id="tab-receive-threshold"
                      type="number"
                      min={0}
                      placeholder="e.g. 10"
                      value={receiveForm.reorder_threshold}
                      onChange={(e) => setReceiveForm({ ...receiveForm, reorder_threshold: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ marginBottom: '14px' }}>
                  <div className="form-group">
                    <label htmlFor="tab-receive-lot">Lot Number</label>
                    <input
                      id="tab-receive-lot"
                      type="text"
                      placeholder="e.g. LOT-2026-A"
                      value={receiveForm.lot_number}
                      onChange={(e) => setReceiveForm({ ...receiveForm, lot_number: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="tab-receive-batch">Batch Number</label>
                    <input
                      id="tab-receive-batch"
                      type="text"
                      placeholder="e.g. BATCH-99"
                      value={receiveForm.batch_number}
                      onChange={(e) => setReceiveForm({ ...receiveForm, batch_number: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ marginBottom: '14px' }}>
                  <div className="form-group">
                    <label htmlFor="tab-receive-exp">Expiration Date</label>
                    <input
                      id="tab-receive-exp"
                      type="date"
                      value={receiveForm.expiration_date}
                      onChange={(e) => setReceiveForm({ ...receiveForm, expiration_date: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="tab-receive-mach">Target Instrument (Optional)</label>
                    <select
                      id="tab-receive-mach"
                      value={receiveForm.machine_id}
                      onChange={(e) => setReceiveForm({ ...receiveForm, machine_id: e.target.value })}
                    >
                      <option value="">General / None</option>
                      {instruments.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ textAlign: 'right', marginTop: '16px' }}>
                  <button type="submit" className="btn-register" disabled={receiveSubmitting} style={{ background: '#059669' }}>
                    {receiveSubmitting ? 'Receiving...' : 'Submit Received Stock'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 5: LOT LOOKUP VIEW */}
        {activeTab === 'lookup' && (
          <div>
            <LotLookup />
          </div>
        )}

        {/* MODAL: REMOVE INVENTORY ITEM (SXFT5-188) */}
        {isRemovalModalOpen && (
          <InventoryRemovalForm
            key={itemToRemove?.id || 'removal-modal'}
            initialItemId={itemToRemove?.id || ''}
            initialItemName={itemToRemove?.item_name || ''}
            isModal={true}
            onSuccess={handleRemovalSuccess}
            onCancel={() => setIsRemovalModalOpen(false)}
          />
        )}

        {/* MODAL: RECEIVE INVENTORY ITEM (SXFT5-181) */}
        {isReceiveModalOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="receive-modal-title">
            <div className="modal-card" style={{ maxWidth: '560px' }}>
              <div className="modal-header">
                <h2 id="receive-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📥</span> {receiveItem ? `Receive More: ${receiveItem.item_name}` : 'Receive New Supplies'}
                </h2>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={() => setIsReceiveModalOpen(false)}
                  aria-label="Close dialog"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleReceiveSubmit}>
                <div className="modal-body">
                  {receiveError && (
                    <div role="alert" style={{ color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem' }}>
                      {receiveError}
                    </div>
                  )}
                  {receiveSuccess && (
                    <div role="status" style={{ color: '#15803d', background: '#f0fdf4', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem' }}>
                      {receiveSuccess}
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="modal-rec-name">Item Name *</label>
                    <input
                      id="modal-rec-name"
                      type="text"
                      required
                      placeholder="e.g. Lipid Reagent Kit"
                      value={receiveForm.item_name}
                      onChange={(e) => setReceiveForm({ ...receiveForm, item_name: e.target.value })}
                      disabled={!!receiveItem}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="modal-rec-qty">Quantity Received *</label>
                      <input
                        id="modal-rec-qty"
                        type="number"
                        required
                        min={1}
                        placeholder="e.g. 25"
                        value={receiveForm.quantity}
                        onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="modal-rec-thresh">Reorder Threshold</label>
                      <input
                        id="modal-rec-thresh"
                        type="number"
                        min={0}
                        placeholder="e.g. 10"
                        value={receiveForm.reorder_threshold}
                        onChange={(e) => setReceiveForm({ ...receiveForm, reorder_threshold: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="modal-rec-lot">Lot Number</label>
                      <input
                        id="modal-rec-lot"
                        type="text"
                        placeholder="e.g. LOT-A"
                        value={receiveForm.lot_number}
                        onChange={(e) => setReceiveForm({ ...receiveForm, lot_number: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="modal-rec-batch">Batch Number</label>
                      <input
                        id="modal-rec-batch"
                        type="text"
                        placeholder="e.g. B-1"
                        value={receiveForm.batch_number}
                        onChange={(e) => setReceiveForm({ ...receiveForm, batch_number: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="modal-rec-exp">Expiration Date</label>
                      <input
                        id="modal-rec-exp"
                        type="date"
                        value={receiveForm.expiration_date}
                        onChange={(e) => setReceiveForm({ ...receiveForm, expiration_date: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="modal-rec-mach">Target Instrument</label>
                      <select
                        id="modal-rec-mach"
                        value={receiveForm.machine_id}
                        onChange={(e) => setReceiveForm({ ...receiveForm, machine_id: e.target.value })}
                      >
                        <option value="">None / Manual</option>
                        {instruments.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setIsReceiveModalOpen(false)}
                      disabled={receiveSubmitting}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn-register" disabled={receiveSubmitting} style={{ background: '#059669' }}>
                      {receiveSubmitting ? 'Receiving...' : 'Confirm Receipt'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* HL7 Analyzer Import Modal */}
        <HL7ImportModal
          isOpen={isHL7ModalOpen}
          onClose={() => setIsHL7ModalOpen(false)}
          onImportComplete={() => {
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>
    </div>
  );
}
