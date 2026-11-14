import { api } from './api';

// Drop empty filters so the backend only sees the ones the user set.
const cleanParams = (params) =>
  Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  );

export const getActivityLogs = async (params = {}, signal) => {
  const res = await api.get('/activity-logs', {
    // Send the browser's offset so date filters mean local days, not UTC days.
    params: cleanParams({ tz_offset: new Date().getTimezoneOffset(), ...params }),
    signal,
  });
  return res.data;
};

export const getActivityLogActions = async () => {
  const res = await api.get('/activity-logs/actions');
  return res.data;
};

export const getActivityLogUsers = async () => {
  const res = await api.get('/activity-logs/users');
  return res.data;
};
