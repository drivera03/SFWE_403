import { api } from './api';

export const getLowStock = async () => {
  const res = await api.get('/inventory/low-stock');
  return res.data;
};

export const getExpiring = async (days = 30) => {
  const res = await api.get('/inventory/expiring', { params: { days } });
  return res.data;
};

export const getInventory = async (search) => {
  const params = search ? { search } : {};
  const res = await api.get('/inventory', { params });
  return res.data;
};

export const receiveSupplies = async (supplyData) => {
  const res = await api.post('/inventory/receive', supplyData);
  return res.data;
};

export const removeInventoryItem = async (itemId, reason) => {
  const res = await api.delete(`/inventory/${itemId}`, { params: { reason } });
  return res.data;
};

export const lookupLot = async (number) => {
  const res = await api.get('/inventory/lookup', { params: { number } });
  return res.data;
};
