// API utility functions for handling requests and token management

/**
 * Base API URL
 */
export const API_URL = 'http://localhost:5000/api';

/**
 * Custom fetch wrapper that handles token management and errors
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise} - The fetch promise
 */
export const fetchWithAuth = async (url, options = {}) => {
  // Get token from localStorage
  const token = localStorage.getItem('token');
  
  // Add authorization header if token exists
  if (token) {
    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };
  }
  
  // Add timeout to fetch request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    // Handle token expiration
    if (response.status === 401) {
      console.warn('Authentication token expired or invalid');
      localStorage.removeItem('token');
      // Redirect to login page
      window.location.reload();
      return null;
    }
    
    return response;
  } catch (error) {
    // Clear the timeout
    clearTimeout(timeoutId);
    
    console.error('Fetch error:', error);
    
    // Handle specific errors
    if (error.name === 'AbortError') {
      console.error('Request timed out - server may be unresponsive');
    } else if (error.message.includes('Failed to fetch')) {
      console.error('Network error - server may be down or unreachable');
    }
    
    throw error;
  }
};

/**
 * Helper function to check if the user is authenticated
 * @returns {boolean} - True if authenticated
 */
export const checkAuthentication = () => {
  return localStorage.getItem('token') !== null;
};

/**
 * Helper function to handle token expiration
 */
export const handleTokenExpiration = () => {
  localStorage.removeItem('token');
  window.location.reload();
};

/**
 * Check if the server is reachable
 * @returns {Promise<boolean>} - True if server is reachable
 */
export const checkServerConnection = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    console.error('Server connection check failed:', error);
    return false;
  }
};

/**
 * Retry a failed fetch operation with exponential backoff
 * @param {Function} fetchFn - The fetch function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise} - The fetch promise
 */
export const retryFetch = async (fetchFn, maxRetries = 3) => {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchFn();
    } catch (error) {
      console.warn(`Fetch attempt ${i + 1} failed:`, error);
      lastError = error;
      
      // Don't retry if it's an authentication error
      if (error.message.includes('401')) {
        break;
      }
      
      // Wait with exponential backoff before retrying
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};
