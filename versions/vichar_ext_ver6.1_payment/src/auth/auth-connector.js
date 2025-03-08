// auth-connector.js - A unified authentication connector module
// This file should be placed in your src/auth/ directory

// Create a global namespace for authentication
window.chessAuthModule = window.chessAuthModule || {};

// Configuration
const API_URL = 'https://api.beekayprecision.com';

/**
 * Check if user is authenticated by verifying token existence
 */
window.chessAuthModule.isAuthenticated = function() {
  try {
    const authData = window.chessAuthModule.getAuthData();
    return !!authData && !!authData.token;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

/**
 * Get the current authenticated user's data
 */
window.chessAuthModule.getCurrentUser = function() {
  try {
    const authData = window.chessAuthModule.getAuthData();
    return authData && authData.user ? authData.user : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Get the authentication token
 */
window.chessAuthModule.getAuthToken = function() {
  try {
    const authData = window.chessAuthModule.getAuthData();
    return authData && authData.token ? authData.token : null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Get complete authentication data from storage
 * Checks multiple storage locations for compatibility
 */
window.chessAuthModule.getAuthData = function() {
  try {
    // Try primary key first
    let authDataStr = localStorage.getItem('chess_assistant_auth');
    
    // If not found, try alternate key set by server
    if (!authDataStr) {
      const tokenDataStr = localStorage.getItem('chess_assistant_token');
      if (tokenDataStr) {
        try {
          const parsedToken = JSON.parse(tokenDataStr);
          const authData = {
            isAuthenticated: true,
            token: parsedToken.access_token,
            user: parsedToken.user
          };
          // Store in correct format for future use
          localStorage.setItem('chess_assistant_auth', JSON.stringify(authData));
          console.log('Converted token data to auth data format');
          return authData;
        } catch (parseError) {
          console.error('Error parsing token data:', parseError);
          return null;
        }
      }
      return null;
    }
    
    return JSON.parse(authDataStr);
  } catch (error) {
    console.error('Error getting auth data:', error);
    return null;
  }
}

/**
 * Set authentication data in storage and notify all extension parts
 */
window.chessAuthModule.setAuthData = function(data) {
  try {
    if (!data) {
      localStorage.removeItem('chess_assistant_auth');
      localStorage.removeItem('chess_assistant_token');
    } else {
      localStorage.setItem('chess_assistant_auth', JSON.stringify(data));
      
      // Update alternate format for consistency
      const tokenData = {
        access_token: data.token,
        token_type: "bearer",
        user: data.user
      };
      localStorage.setItem('chess_assistant_token', JSON.stringify(tokenData));
    }
    
    // Notify background script about the change
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({
          action: 'auth_updated',
          data: data
        });
      } catch (error) {
        console.error('Error sending auth update message:', error);
      }
    }
    
    // Trigger custom event for local listeners
    const authEvent = new CustomEvent('chess_auth_changed', {
      detail: data
    });
    window.dispatchEvent(authEvent);
    
    // Also set a timestamp to trigger storage listeners
    localStorage.setItem('chess_assistant_auth_updated', Date.now().toString());
    
    return true;
  } catch (error) {
    console.error('Error setting auth data:', error);
    return false;
  }
}

/**
 * Update user data without changing the token
 */
window.chessAuthModule.updateUserData = function(userData) {
  try {
    const authData = window.chessAuthModule.getAuthData();
    if (authData) {
      authData.user = userData;
      window.chessAuthModule.setAuthData(authData);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating user data:', error);
    return false;
  }
}

/**
 * Clear all auth data (logout)
 */
window.chessAuthModule.clearAuth = function() {
  try {
    localStorage.removeItem('chess_assistant_auth');
    localStorage.removeItem('chess_assistant_token');
    localStorage.removeItem('chess_assistant_auth_updated');
    
    // Notify about logout
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({
          action: 'auth_updated',
          data: null
        });
      } catch (error) {
        console.error('Error sending logout message:', error);
      }
    }
    
    // Trigger custom event for local listeners
    const authEvent = new CustomEvent('chess_auth_changed', {
      detail: null
    });
    window.dispatchEvent(authEvent);
    
    return true;
  } catch (error) {
    console.error('Error clearing auth data:', error);
    return false;
  }
}

/**
 * Login with Google - Opens auth window and listens for auth data
 */
window.chessAuthModule.loginWithGoogle = function() {
  console.log('Starting Google login process...');
  
  // First check if we already have valid auth data
  const authData = window.chessAuthModule.getAuthData();
  
  if (authData && authData.token) {
    console.log('Found existing auth data from callback');
    // Validate the token with the server
    return window.chessAuthModule.validateToken(authData.token)
      .then(isValid => {
        if (isValid) {
          console.log('Existing token is valid');
          return authData;
        } else {
          console.log('Existing token is invalid, clearing');
          window.chessAuthModule.clearAuth();
          throw new Error('Invalid token');
        }
      })
      .catch(error => {
        console.error('Error validating token:', error);
        // Continue with new login attempt
        throw error;
      });
  }
  
  // If we don't have valid auth data, start the login process
  return new Promise((resolve, reject) => {
    fetch(`${API_URL}/auth/login/google`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (!data.url) {
          throw new Error('No authentication URL found in the response');
        }
        
        // Open the URL in a new tab
        if (typeof chrome !== 'undefined' && chrome.tabs) {
          chrome.tabs.create({ url: data.url });
        } else {
          window.open(data.url, '_blank');
        }
        
        // Set up a storage listener to detect when auth is completed
        const storageListener = (event) => {
          if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token' || event.key === 'chess_assistant_auth_updated') {
            // Auth data has changed - check if we have a valid token now
            const newAuthData = window.chessAuthModule.getAuthData();
            if (newAuthData && newAuthData.token) {
              window.removeEventListener('storage', storageListener);
              window.removeEventListener('chess_auth_changed', authChangedListener);
              clearTimeout(timeout);
              resolve(newAuthData);
            }
          }
        };
        
        window.addEventListener('storage', storageListener);
        
        // Also listen for custom auth changed event
        const authChangedListener = (event) => {
          const authData = event.detail;
          if (authData && authData.token) {
            window.removeEventListener('chess_auth_changed', authChangedListener);
            window.removeEventListener('storage', storageListener);
            clearTimeout(timeout);
            resolve(authData);
          }
        };
        
        window.addEventListener('chess_auth_changed', authChangedListener);
        
        // Set a timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
          window.removeEventListener('storage', storageListener);
          window.removeEventListener('chess_auth_changed', authChangedListener);
          reject(new Error('Login timed out. Please try again.'));
        }, 120000); // 2 minute timeout
      })
      .catch(error => {
        console.error('Login error:', error);
        reject(error);
      });
  });
}

/**
 * Validate token with server
 */
window.chessAuthModule.validateToken = function(token) {
  if (!token) return Promise.resolve(false);
  
  return fetch(`${API_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => response.ok)
  .catch(error => {
    console.error('Token validation error:', error);
    return false;
  });
}

/**
 * Fetch user data from the server
 */
window.chessAuthModule.fetchUserData = function(token) {
  if (!token) {
    token = window.chessAuthModule.getAuthToken();
    if (!token) {
      return Promise.reject(new Error('No auth token available'));
    }
  }
  
  return fetch(`${API_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Failed to fetch user data: ${response.status}`);
    }
    return response.json();
  })
  .then(userData => {
    // Update the stored user data
    const authData = window.chessAuthModule.getAuthData();
    if (authData) {
      authData.user = userData;
      window.chessAuthModule.setAuthData(authData);
    }
    return userData;
  });
}

/**
 * Validate stored auth and refresh if needed
 */
window.chessAuthModule.validateStoredAuth = function() {
  if (window.chessAuthModule.isAuthenticated()) {
    const token = window.chessAuthModule.getAuthToken();
    if (!token) return Promise.resolve(false);
    
    // Try a simple validation
    return window.chessAuthModule.validateToken(token)
      .then(isValid => {
        if (isValid) {
          // Token is valid, just refresh user data
          return window.chessAuthModule.fetchUserData(token)
            .then(() => true)
            .catch(userDataError => {
              console.error('Error refreshing user data:', userDataError);
              // Continue anyway if we can't refresh user data
              return true;
            });
        } else {
          // If token is invalid, clear auth data
          window.chessAuthModule.clearAuth();
          return false;
        }
      })
      .catch(error => {
        console.error('Auth validation error:', error);
        return false;
      });
  }
  return Promise.resolve(false);
}

/**
 * Get available credit packages
 */
window.chessAuthModule.getCreditPackages = function() {
  const token = window.chessAuthModule.getAuthToken();
  if (!token) {
    return Promise.reject(new Error('No auth token available'));
  }
  
  return fetch(`${API_URL}/payments/credits/packages`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Failed to fetch credit packages: ${response.status}`);
    }
    return response.json();
  });
}

/**
 * Open payment page for package
 */
window.chessAuthModule.openPaymentPage = function(packageId) {
  const token = window.chessAuthModule.getAuthToken();
  if (!token) {
    return Promise.reject(new Error('No auth token available'));
  }
  
  // Open the payment page in a new tab
  const paymentUrl = `${API_URL}/payments/payment-page?package_id=${packageId}`;
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.create({ url: paymentUrl });
  } else {
    window.open(paymentUrl, '_blank');
  }
  
  // Set up listener for payment completion
  return new Promise((resolve, reject) => {
    const storageListener = (event) => {
      if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token' || event.key === 'chess_assistant_auth_updated') {
        // Auth data has changed - this could be due to payment completion
        const authData = window.chessAuthModule.getAuthData();
        if (authData && authData.user) {
          window.removeEventListener('storage', storageListener);
          window.removeEventListener('chess_auth_changed', authChangedListener);
          clearTimeout(timeout);
          resolve(authData.user);
        }
      }
    };
    
    window.addEventListener('storage', storageListener);
    
    // Also listen for custom auth changed event
    const authChangedListener = (event) => {
      const authData = event.detail;
      if (authData && authData.user) {
        window.removeEventListener('chess_auth_changed', authChangedListener);
        window.removeEventListener('storage', storageListener);
        clearTimeout(timeout);
        resolve(authData.user);
      }
    };
    
    window.addEventListener('chess_auth_changed', authChangedListener);
    
    // Set a timeout to avoid hanging indefinitely
    const timeout = setTimeout(() => {
      window.removeEventListener('storage', storageListener);
      window.removeEventListener('chess_auth_changed', authChangedListener);
      reject(new Error('Payment timed out. Please check your account to verify if payment was successful.'));
    }, 300000); // 5 minute timeout
  });
}

// Initialize when the script loads
console.log('Auth connector module initialized');

// Check for auth data and validate on init
const authData = window.chessAuthModule.getAuthData();
if (authData && authData.token) {
  console.log('Found existing auth data on init');
  
  // Validate token
  window.chessAuthModule.validateToken(authData.token)
    .then(isValid => {
      if (!isValid) {
        console.log('Token invalid on init, clearing auth');
        window.chessAuthModule.clearAuth();
      } else {
        console.log('Token valid on init');
        
        // Refresh user data
        window.chessAuthModule.fetchUserData(authData.token)
          .catch(error => {
            console.error('Error refreshing user data on init:', error);
          });
      }
    })
    .catch(error => {
      console.error('Error validating token on init:', error);
    });
}

// Listen for storage changes to detect auth updates
window.addEventListener('storage', event => {
  if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token') {
    console.log(`Auth data changed in localStorage (key: ${event.key})`);
    // Notify listeners about the auth change
    const authEvent = new CustomEvent('chess_auth_changed', {
      detail: window.chessAuthModule.getAuthData()
    });
    window.dispatchEvent(authEvent);
  } else if (event.key === 'chess_assistant_auth_updated') {
    console.log('Auth update detected');
    // Refresh the auth data in memory/UI
    const authData = window.chessAuthModule.getAuthData();
    const authEvent = new CustomEvent('chess_auth_changed', {
      detail: authData
    });
    window.dispatchEvent(authEvent);
  }
});

// Expose the module for non-module contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = window.chessAuthModule;
}