import React, { useState, useEffect } from 'react';
import './Login.css';
import heartbeatLogo from './assets/heartbeat-logo.svg';
import Dashboard from './Dashboard';
import { API_URL } from './utils/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    role: 'doctor',
    email: '',
    adminPassword: ''
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [requiresAdminVerification, setRequiresAdminVerification] = useState(false);
  const [userRole, setUserRole] = useState('');
  
  const [pendingApproval, setPendingApproval] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  // Check if user is already authenticated on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const approved = localStorage.getItem('approved') === 'true';
    
    if (token) {
      setIsAuthenticated(approved);
      setUserRole(role || '');
      
      setPendingApproval(token && !approved);
    }
  }, []);

  // Password validation function
const validatePassword = (password) => {
  // At least 8 characters, one symbol, one uppercase, one lowercase, one number
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password);
};

const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Password strength validation for registration
    if (!isLogin && !validatePassword(formData.password)) {
      setError('Password must be at least 8 characters long and include at least one uppercase letter, one lowercase letter, one number, and one symbol.');
      return;
    }

    try {
      const endpoint = isLogin ? '/login' : '/register';
      const requestBody = {
        username: formData.username,
        password: formData.password,
      };

      // Add role and email for registration
      if (!isLogin) {
        requestBody.role = formData.role;
        requestBody.email = formData.email;
        // Do NOT send adminPassword on registration
      }

      // Add admin password if needed (login only)
      if (isLogin && requiresAdminVerification) {
        requestBody.adminPassword = formData.adminPassword;
      }

      let response;
      // If registration was successful and role is admin, switch to login before anything else
      if (!isLogin && formData.role === 'admin') {
        response = await fetch(API_URL + endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        const data = await response.json();
        if (response.ok) {
          setMessage('Administrator registered successfully. Please log in.');
          setIsLogin(true);
          setFormData({
            username: '',
            password: '',
            confirmPassword: '',
            role: 'doctor',
            email: '',
            adminPassword: ''
          });
          return;
        } else {
          setError(data.error || 'Registration failed');
          return;
        }
      } else {
        response = await fetch(API_URL + endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || (isLogin ? 'Invalid credentials' : 'Registration failed'));
        return;
      }

      // Handle admin verification requirement
      if (data.requiresAdminVerification) {
        setRequiresAdminVerification(true);
        setMessage(data.message || 'Admin verification required');
        return;
      }

      // Handle pending approval
      if (data.token && !data.approved) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('approved', 'false');
        setUserRole(data.role);
        setPendingApproval(true);
        setMessage(data.message || 'Your account is pending approval');
        return;
      }

      // Handle successful authentication
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role);
        localStorage.setItem('approved', data.approved ? 'true' : 'false');
        setIsAuthenticated(true);
        setUserRole(data.role);
        
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.message === 'Failed to fetch') {
        setError('Unable to connect to the server. Please check your connection and try again.');
      } else {
        setError(err.message);
      }
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setMessage('');
    setRequiresAdminVerification(false);
    setFormData({
      username: '',
      password: '',
      confirmPassword: '',
      role: 'doctor',
      adminPassword: ''
    });
  };

  if (isAuthenticated) {
    return <Dashboard 
      userRole={userRole}
      onLogout={() => {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('approved');
        setIsAuthenticated(false);
        setUserRole('');
        
        setPendingApproval(false);
      }} 
    />;
  }

  // Show pending approval message
  if (pendingApproval) {
    return (
      <div className="login-container">
        <div className="login-box">
          <img src={heartbeatLogo} alt="Heartbeat Logo" className="logo" />
          <h2>Account Pending Approval</h2>
          <p>Your {userRole} account is waiting for administrator approval.</p>
          <p>Please check back later or contact an administrator.</p>
          <button 
            className="submit-button"
            onClick={() => {
              localStorage.removeItem('token');
              localStorage.removeItem('role');
              localStorage.removeItem('approved');
              setPendingApproval(false);
              setIsLogin(true);
            }}
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <img src={heartbeatLogo} alt="Heartbeat Logo" className="logo" />
        <h2>{isLogin ? 'Login' : 'Sign Up'}</h2>
        {message && <div className="info-message">{message}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={formData.username}
              onChange={handleChange}
            />
          </div>
          <div className="form-group">
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
            />
          </div>
          {!isLogin && (
            <>
              <div className="form-group">
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Confirm Password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="role-select"
                >
                  <option value="doctor">Doctor</option>
                  <option value="nurse">Nurse</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
            </>
          )}
          {isLogin && requiresAdminVerification && (
            <div className="form-group">
              <input
                type="password"
                name="adminPassword"
                placeholder="Admin Master Password"
                value={formData.adminPassword}
                onChange={handleChange}
              />
              <div className="password-hint">Enter the administrator master password</div>
            </div>
          )}
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="submit-button">
            {isLogin ? 'Login' : 'Sign Up'}
          </button>
        </form>
        <p className="switch-mode" onClick={switchMode}>
          {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Login'}
        </p>
      </div>
    </div>
  );
}

export default App;
