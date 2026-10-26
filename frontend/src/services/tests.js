import { api } from './api';

// Lab Test endpoints (scoped to patient)
export const getPatientTests = async (patientId) => {
  const res = await api.get(`/patients/${patientId}/tests`);
  return res.data;
};

export const getLabTest = async (patientId, testId) => {
  const res = await api.get(`/patients/${patientId}/tests/${testId}`);
  return res.data;
};

export const createLabTest = async (patientId, testData) => {
  const res = await api.post(`/patients/${patientId}/tests`, testData);
  return res.data;
};

export const updateLabTest = async (patientId, testId, testData) => {
  const res = await api.put(`/patients/${patientId}/tests/${testId}`, testData);
  return res.data;
};

export const deleteLabTest = async (patientId, testId) => {
  const res = await api.delete(`/patients/${patientId}/tests/${testId}`);
  return res.data;
};
