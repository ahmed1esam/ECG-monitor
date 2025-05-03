import React, { useState, useEffect } from 'react';
import { fetchWithAuth, API_URL } from './utils/api';
import './RegisterPatient.css';

function RegisterPatient({ onBack }) {
  const [patients, setPatients] = useState([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [patientData, setPatientData] = useState({
    first_name: '',
    last_name: '',
    dob: '',
    gender: 'male',
    deviceId: ''
  });
  
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [devices, setDevices] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  // Fetch available devices on component mount
  useEffect(() => {
    fetchDevices();
    fetchPatients();
  }, []);

  const handleDeletePatient = async (patientId) => {
    if (!window.confirm('Are you sure you want to delete this patient?')) return;
    setIsLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetchWithAuth(`${API_URL}/patients/${patientId}`, {
        method: 'DELETE',
      });
      if (!response) throw new Error('Server is unreachable. Please try again later.');
      if (response.ok) {
        setMessage('Patient deleted successfully');
        fetchPatients();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete patient');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };


  const fetchDevices = async () => {
    setIsLoadingDevices(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/devices`);
      
      if (!response) {
        throw new Error('Server is unreachable. Please try again later.');
      }

      if (response.ok) {
        const data = await response.json();
        setDevices(data.devices || []);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch devices');
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError(err.message);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPatientData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const fetchPatients = async () => {
    setIsLoadingPatients(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/patients`);
      if (!response) throw new Error('Server is unreachable. Please try again later.');
      if (response.ok) {
        const data = await response.json();
        setPatients(data.patients || []);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch patients');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoadingPatients(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      // Prepare payload matching backend expectations
      // Only send fields required by backend
      const payload = {
        first_name: patientData.first_name,
        last_name: patientData.last_name,
        dob: patientData.dob,
        gender: patientData.gender,
        // The backend expects deviceId to be any string identifier as required (not necessarily a numeric id)
        deviceId: patientData.deviceId
      };
      const response = await fetchWithAuth(`${API_URL}/register-patient`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response) {
        throw new Error('Server is unreachable. Please try again later.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to register patient');
      }

      setMessage(data.message || 'Patient registered successfully');
      setRegistrationSuccess(true);
      // Reset form after successful registration
      setPatientData({
        first_name: '',
        last_name: '',
        dob: '',
        gender: 'male',
        deviceId: ''
      });
      // Refresh patient list
      fetchPatients();
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewRegistration = () => {
    setRegistrationSuccess(false);
    setMessage('');
  };

  return (
    <div className="register-patient-container">
      <div className="patient-list-section">
        <h2>Existing Patients</h2>
        {isLoadingPatients ? (
          <div>Loading patients...</div>
        ) : patients.length === 0 ? (
          <div>No patients registered yet.</div>
        ) : (
          <div className="devices-table-container">
  <table className="devices-table">
    <thead>
      <tr>
        <th>First Name</th>
        <th>Last Name</th>
        <th>Date of Birth</th>
        <th>Gender</th>
        <th>Device ID</th>
        <th>Device Name</th>
        <th>Status</th>
        <th>Delete</th>
      </tr>
    </thead>
    <tbody>
      {patients.map((p) => {
        // Find the device info for this patient
        const device = devices.find(d => d.deviceId === p.deviceId);
        return (
          <tr key={p.id}>
            <td>{p.first_name}</td>
            <td>{p.last_name}</td>
            <td>{p.dob}</td>
            <td>{p.gender}</td>
            <td>{p.deviceId}</td>
            <td>{device ? device.deviceName : '-'}</td>
            <td>
              {device ? (
                <span className={`status-badge status-${device.status || 'inactive'}`}>
                  {device.status || 'Inactive'}
                </span>
              ) : (
                <span className="status-badge status-inactive">No Device</span>
              )}
            </td>
            <td>
              <button
                className="delete-button"
                onClick={() => handleDeletePatient(p.id)}
                style={{marginLeft: 8}}
              >
                Delete
              </button>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
</div>
        )}
      </div>

      <div className="register-patient-header">
        <h2>Register New Patient</h2>
        <button className="back-button" onClick={onBack}>
          Back to Dashboard
        </button>
      </div>

      {registrationSuccess ? (
        <div className="success-container">
          <div className="success-message">
            <h3>Patient Registration Successful</h3>
            <p>{message}</p>
            <button 
              className="new-registration-button"
              onClick={handleNewRegistration}
            >
              Register Another Patient
            </button>
          </div>
        </div>
      ) : (
        <div className="register-patient-form-container">
          {message && <div className="info-message">{message}</div>}
          {error && <div className="error-message">{error}</div>}
          
          <form onSubmit={handleSubmit} className="register-patient-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name*</label>
                <input
                  type="text"
                  id="first_name"
                  name="first_name"
                  value={patientData.first_name}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name*</label>
                <input
                  type="text"
                  id="last_name"
                  name="last_name"
                  value={patientData.last_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="dateOfBirth">Date of Birth*</label>
                <input
                  type="date"
                  id="dob"
                  name="dob"
                  value={patientData.dob}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="gender">Gender*</label>
                <select
                  id="gender"
                  name="gender"
                  value={patientData.gender}
                  onChange={handleChange}
                  required
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="deviceId">Assigned Device*</label>
                <select
                  id="deviceId"
                  name="deviceId"
                  value={patientData.deviceId}
                  onChange={handleChange}
                  required
                >
                  <option value="">-- Select a device --</option>
                  {isLoadingDevices ? (
                    <option value="" disabled>Loading devices...</option>
                  ) : (
                    devices
                      .filter(device => device.status === 'active')
                      .map(device => (
                        <option key={device.id} value={device.deviceId}>
                          {device.deviceName} ({device.deviceId})
                        </option>
                      ))
                  )}
                </select>
                {devices.length === 0 && !isLoadingDevices && (
                  <div className="form-hint">No devices available. Please add devices in the Device Management section.</div>
                )}
              </div>
            </div>

            <div className="form-actions">
              <button 
                type="submit" 
                className="submit-button"
                disabled={isLoading}
              >
                {isLoading ? 'Registering...' : 'Register Patient'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default RegisterPatient;
