import { api } from './api';

export const getLowStock = async () => {
  const res = await api.get('/inventory/low-stock');
  return res.data;
};

export const lookupLot = async (number) => {
  const res = await api.get('/inventory/lookup', { params: { number } });
  return res.data;
};