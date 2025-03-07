// auth-storage.js - Handle authentication storage and management
const AUTH_TOKEN_KEY = 'chess_assistant_auth';
const API_URL = "https://api.beekayprecision.com";

/**
 * Get the stored authentication token
 * @returns {Object|null} The auth token object or null if not authenticated
 */
function getAuthToken() {
  const authData = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!authData) return null;
  
  try {
    const auth = JSON.parse(authData);
    return auth;
  } catch (e) {
    console.error("Error parsing auth data:", e);
    return null;
  }
}

/**
 * Check if the user is authenticated
 * @returns {boolean} True if authenticated
 */
function isAuthenticated() {
  const auth = getAuthToken();
  if (!auth || !auth.access_token) return false;
  
  // Check if token is expired (if we have expiry info)
  if (auth.expires_at) {
    const now = Date.now();
    if (now >= auth.expires_at) {
      return false;
    }
  }
  
  return true;
}

/**
 * Save authentication token to storage
 * @param {Object} tokenData The token data to save
 */
function saveAuthToken(tokenData) {
  // Add expiry date (24 hours from now)
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
  const dataToSave = {
    ...tokenData,
    expires_at: expiresAt
  };
  
  localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(dataToSave));
}

/**
 * Clear authentication data
 */
function clearAuth() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

/**
 * Get the current user data
 * @returns {Object|null} User data or null if not authenticated
 */
function getCurrentUser() {
  const auth = getAuthToken();
  if (!auth || !auth.user) return null;
  return auth.user;
}

/**
 * Update the user data in storage (e.g., after credit purchase)
 * @param {Object} userData The updated user data
 */
function updateUserData(userData) {
  const auth = getAuthToken();
  if (!auth) return;
  
  auth.user = {
    ...auth.user,
    ...userData
  };
  
  localStorage.setItem(AUTH_TOKEN_KEY, JSON.stringify(auth));
}

/**
 * Open Google login in popup window
 */
function loginWithGoogle() {
  return new Promise((resolve, reject) => {
    const width = 600;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      `${API_URL}/auth/login/google`,
      'chess_login',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    // Check if popup was blocked
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      reject(new Error('Login popup was blocked. Please allow popups for this site.'));
      return;
    }
    
    // Setup message listener for the popup response
    const messageHandler = (event) => {
      // Verify origin for security
      if (event.origin !== API_URL) {
        return;
      }
      
      if (event.data && event.data.type === 'chess_assistant_auth') {
        window.removeEventListener('message', messageHandler);
        
        if (event.data.data) {
          saveAuthToken(event.data.data);
          resolve(event.data.data);
        } else {
          reject(new Error('Authentication failed'));
        }
        
        if (!popup.closed) {
          popup.close();
        }
      }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Fallback if popup closes without sending a message
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        
        // Check if we got authenticated during the process
        if (isAuthenticated()) {
          resolve(getAuthToken());
        } else {
          reject(new Error('Login window was closed'));
        }
      }
    }, 500);
  });
}

/**
 * Open the payment page in a popup
 * @param {string} packageId The package ID to purchase
 */
function openPaymentPage(packageId) {
  return new Promise((resolve, reject) => {
    const auth = getAuthToken();
    if (!auth || !auth.access_token) {
      reject(new Error('User is not authenticated'));
      return;
    }
    
    const width = 450;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popup = window.open(
      `${API_URL}/payments/payment-page?package_id=${packageId}`,
      'chess_payment',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    // Check if popup was blocked
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      reject(new Error('Payment popup was blocked. Please allow popups for this site.'));
      return;
    }
    
    // Setup message listener for the popup response
    const messageHandler = (event) => {
      // Verify origin for security
      if (event.origin !== API_URL) {
        return;
      }
      
      if (event.data && event.data.type === 'chess_assistant_credits_updated') {
        window.removeEventListener('message', messageHandler);
        
        if (event.data.data) {
          updateUserData(event.data.data);
          resolve(event.data.data);
        } else {
          reject(new Error('Payment update failed'));
        }
        
        if (!popup.closed) {
          popup.close();
        }
      }
      
      if (event.data && event.data.type === 'chess_assistant_payment_status') {
        window.removeEventListener('message', messageHandler);
        
        if (event.data.success) {
          // We should refresh user data to get updated credits
          fetchUserData()
            .then(userData => {
              resolve(userData);
            })
            .catch(err => {
              reject(err);
            });
        } else {
          reject(new Error('Payment failed'));
        }
        
        if (!popup.closed) {
          popup.close();
        }
      }
    };
    
    window.addEventListener('message', messageHandler);
    
    // Fallback if popup closes without sending a message
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        
        // Refresh user data to check if credits were updated
        fetchUserData()
          .then(userData => {
            resolve(userData);
          })
          .catch(err => {
            reject(new Error('Payment window was closed'));
          });
      }
    }, 500);
  });
}

/**
 * Fetch fresh user data from the API
 */
async function fetchUserData() {
  const auth = getAuthToken();
  if (!auth || !auth.access_token) {
    throw new Error('User is not authenticated');
  }
  
  try {
    const response = await fetch(`${API_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth.access_token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch user data');
    }
    
    const userData = await response.json();
    updateUserData(userData);
    return userData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

/**
 * Get available credit packages
 */
async function getCreditPackages() {
  const auth = getAuthToken();
  if (!auth || !auth.access_token) {
    throw new Error('User is not authenticated');
  }
  
  try {
    const response = await fetch(`${API_URL}/payments/credits/packages`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth.access_token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch credit packages');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching credit packages:', error);
    throw error;
  }
}

// Export the functions
export {
  getAuthToken,
  isAuthenticated,
  saveAuthToken,
  clearAuth,
  getCurrentUser,
  updateUserData,
  loginWithGoogle,
  openPaymentPage,
  fetchUserData,
  getCreditPackages
};