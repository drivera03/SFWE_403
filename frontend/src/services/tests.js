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

// Test Intake endpoints (Core /tests API)
export const createTestIntake = async (testData) => {
  const res = await api.post('/tests', testData);
  return res.data;
};

export const getIntakeTests = async (patientId) => {
  const res = await api.get('/tests', { params: { patient_id: patientId } });
  return res.data;
};

export const getIntakeTestById = async (testId) => {
  const res = await api.get(`/tests/${testId}`);
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

