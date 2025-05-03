import React, { useState, useEffect } from 'react';
import { fetchWithAuth, API_URL } from './utils/api';
import './DeviceManagement.css';

function DeviceManagement({ onBack }) {
  const [devices, setDevices] = useState([]);
  // Field names must match backend Device model (see backend/models.py)
const [newDevice, setNewDevice] = useState({
  deviceId: '', // string, unique device identifier
  deviceName: '', // string, device name
  deviceType: 'ecg', // string, device type
  status: 'active', // string, status (active, maintenance, inactive)
  wifiSSID: '', // string, WiFi SSID
  wifiPassword: '' // string, WiFi password
});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState(null);

  // Fetch devices on component mount
  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/devices`);
      
      if (!response) {
        throw new Error('Server is unreachable. Please try again later.');
      }

      if (response.ok) {
        const data = await response.json();
        console.log('Devices data:', data);
        setDevices(data.devices || []);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch devices');
      }
    } catch (err) {
      console.error('Error fetching devices:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewDevice(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      const endpoint = isEditing ? `/devices/${editingDeviceId}` : '/devices';
      const method = isEditing ? 'PUT' : 'POST';
      
      const response = await fetchWithAuth(`${API_URL}${endpoint}`, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newDevice),
      });

      if (!response) {
        throw new Error('Server is unreachable. Please try again later.');
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save device');
      }

      setMessage(isEditing ? 'Device updated successfully' : 'Device added successfully');
      
      // Reset form after successful submission
      setNewDevice({
        deviceId: '',
        deviceName: '',
        deviceType: 'ecg',
        status: 'active',
        wifiSSID: '',
        wifiPassword: ''
      });
      setIsEditing(false);
      setEditingDeviceId(null);
      
      // Refresh device list
      fetchDevices();
    } catch (err) {
      console.error('Device save error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (device) => {
    setNewDevice({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      status: device.status,
      wifiSSID: device.wifiSSID || '',
      wifiPassword: '' // Do not pre-fill password for security
    });
    setIsEditing(true);
    setEditingDeviceId(device.id);
  };

  const handleDelete = async (deviceId) => {
    if (!window.confirm('Are you sure you want to delete this device?')) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithAuth(`${API_URL}/devices/${deviceId}`, {
        method: 'DELETE'
      });

      if (!response) {
        throw new Error('Server is unreachable. Please try again later.');
      }

      if (response.ok) {
        setMessage('Device deleted successfully');
        fetchDevices();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete device');
      }
    } catch (err) {
      console.error('Error deleting device:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setNewDevice({
      deviceId: '',
      deviceName: '',
      deviceType: 'ecg',
      status: 'active',
      wifiSSID: '',
      wifiPassword: ''
    });
    setIsEditing(false);
    setEditingDeviceId(null);
  };

  return (
    <div className="device-management-container">
      <div className="device-management-header">
        <h2>Device Management</h2>
        <button className="back-button" onClick={onBack}>
          Back to Dashboard
        </button>
      </div>

      <div className="device-management-content">
        {message && <div className="info-message">{message}</div>}
        {error && <div className="error-message">{error}</div>}

        <div className="device-form-container">
          <h3>{isEditing ? 'Edit Device' : 'Add New Device'}</h3>
          <form onSubmit={handleSubmit} className="device-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="deviceId">Device ID*</label>
                <input
                  type="text"
                  id="deviceId"
                  name="deviceId"
                  value={newDevice.deviceId}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="deviceName">Device Name*</label>
                <input
                  type="text"
                  id="deviceName"
                  name="deviceName"
                  value={newDevice.deviceName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="wifiSSID">WiFi SSID</label>
                <input
                  type="text"
                  id="wifiSSID"
                  name="wifiSSID"
                  value={newDevice.wifiSSID}
                  onChange={handleChange}
                  placeholder="WiFi Network Name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="wifiPassword">WiFi Password</label>
                <input
                  type="password"
                  id="wifiPassword"
                  name="wifiPassword"
                  value={newDevice.wifiPassword}
                  onChange={handleChange}
                  placeholder="WiFi Password"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="deviceType">Device Type*</label>
                <select
                  id="deviceType"
                  name="deviceType"
                  value={newDevice.deviceType}
                  onChange={handleChange}
                  required
                >
                  <option value="ecg">ECG Monitor</option>
                  <option value="blood_pressure">Blood Pressure Monitor</option>
                  <option value="pulse_oximeter">Pulse Oximeter</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="status">Status*</label>
                <select
                  id="status"
                  name="status"
                  value={newDevice.status}
                  onChange={handleChange}
                  required
                >
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              {isEditing && (
                <button 
                  type="button" 
                  className="cancel-button"
                  onClick={handleCancel}
                >
                  Cancel
                </button>
              )}
              <button 
                type="submit" 
                className="submit-button"
                disabled={isLoading}
              >
                {isLoading ? 'Saving...' : isEditing ? 'Update Device' : 'Add Device'}
              </button>
            </div>
          </form>
        </div>

        <div className="devices-list-container">
          <h3>Registered Devices</h3>
          {isLoading && <div className="loading-message">Loading devices...</div>}
          
          {devices.length === 0 ? (
            <div className="no-devices-message">No devices registered yet</div>
          ) : (
            <div className="devices-table-container">
              <table className="devices-table">
                <thead>
                  <tr>
                    <th>Device ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>WiFi SSID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.deviceId}</td>
                      <td>{device.deviceName}</td>
                      <td>{device.deviceType}</td>
                      <td>
                        <span className={`status-badge status-${device.status}`}>
                          {device.status}
                        </span>
                      </td>
                      <td>{device.wifiSSID || ''}</td>
                      <td className="action-buttons">
                        <button 
                          className="edit-button"
                          onClick={() => handleEdit(device)}
                        >
                          Edit
                        </button>
                        <button 
                          className="delete-button"
                          onClick={() => handleDelete(device.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeviceManagement;
