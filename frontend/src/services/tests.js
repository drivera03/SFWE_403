import { api } from './api';

// All tests live in one table behind one API: /tests
export const getPatientTests = async (patientId) => {
  const res = await api.get('/tests', { params: { patient_id: patientId } });
  return res.data;
};

export const getTest = async (testId) => {
  const res = await api.get(`/tests/${testId}`);
  return res.data;
};

export const createTest = async (testData) => {
  const res = await api.post('/tests', testData);
  return res.data;
};

export const updateTest = async (testId, testData) => {
  const res = await api.put(`/tests/${testId}`, testData);
  return res.data;
};

export const deleteTest = async (testId) => {
  const res = await api.delete(`/tests/${testId}`);
  return res.data;
};

export const getPhysicians = async () => {
  try {
    const res = await api.get('/tests/physicians');
    if (Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
  } catch (err) {
    console.warn('Falling back to default physicians list:', err.message);
  }
  return [
    { id: 1, name: 'Dr. Gregory House' },
    { id: 2, name: 'Dr. Allison Cameron' },
    { id: 3, name: 'Dr. Robert Chase' },
    { id: 4, name: 'Dr. Lisa Cuddy' },
    { id: 5, name: 'Dr. Eric Foreman' },
  ];
};

export const createPhysician = async (name) => {
  const res = await api.post('/tests/physicians', { name });
  return res.data;
};

export const getInstruments = async () => {
  try {
    const res = await api.get('/tests/instruments');
    if (Array.isArray(res.data) && res.data.length > 0) {
      return res.data;
    }
  } catch (err) {
    console.warn('Falling back to default instruments list:', err.message);
  }
  return [
    { id: 1, name: 'Sysmex XN-1000' },
    { id: 2, name: 'Roche Cobas 6000' },
    { id: 3, name: 'Abbott Architect c8000' },
    { id: 4, name: 'Beckman Coulter DxH 900' },
  ];
};

// e.g. makeAccessionId('SMP') -> "SMP-481902"
export const makeAccessionId = (prefix) => `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;

// Turns an axios error into readable text. FastAPI sends `detail` as a string,
// or as a list of {msg} objects for validation (422) errors.
export const apiErrorMessage = (err, fallback = 'Something went wrong.') => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => `${(d.loc || []).slice(1).join('.') || 'request'}: ${d.msg}`)
      .join('; ');
  }
  return err?.message || fallback;
};
