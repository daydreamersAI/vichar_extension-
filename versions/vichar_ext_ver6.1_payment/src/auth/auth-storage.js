// auth-storage.js - Updated to work without ES modules

// Create a module object that will be accessible globally
window.chessAuthModule = {};

// Configuration
const API_URL = 'https://api.beekayprecision.com';

// Check if user is authenticated
window.chessAuthModule.isAuthenticated = function() {
  try {
    const authData = window.chessAuthModule.getAuthData();
    return !!authData && !!authData.token;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

// Get the current user data
window.chessAuthModule.getCurrentUser = function() {
  try {
    const authData = window.chessAuthModule.getAuthData();
    return authData && authData.user ? authData.user : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Get the auth token
window.chessAuthModule.getAuthToken = function() {
  try {
    const authData = window.chessAuthModule.getAuthData();
    return authData && authData.token ? authData.token : null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Get the complete auth data
window.chessAuthModule.getAuthData = function() {
  try {
    // Try the primary key first
    let authDataStr = localStorage.getItem('chess_assistant_auth');
    
    // If not found, try the alternate key that might be set by the server
    if (!authDataStr) {
      const tokenDataStr = localStorage.getItem('chess_assistant_token');
      if (tokenDataStr) {
        // Convert the token data format to the auth data format
        try {
          const parsedToken = JSON.parse(tokenDataStr);
          const authData = {
            isAuthenticated: true,
            token: parsedToken.access_token,
            user: parsedToken.user
          };
          // Also store it in the correct format for future use
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

// Set the auth data
window.chessAuthModule.setAuthData = function(data) {
  try {
    if (!data) {
      localStorage.removeItem('chess_assistant_auth');
      localStorage.removeItem('chess_assistant_token');
    } else {
      localStorage.setItem('chess_assistant_auth', JSON.stringify(data));
      
      // Also update the alternate format for consistency
      const tokenData = {
        access_token: data.token,
        token_type: "bearer",
        user: data.user
      };
      localStorage.setItem('chess_assistant_token', JSON.stringify(tokenData));
    }
    
    // Also notify the background script about the change
    if (chrome && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({
          action: 'auth_updated',
          data: data
        });
      } catch (error) {
        console.error('Error sending auth update message:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error setting auth data:', error);
    return false;
  }
}

// Update user data without changing the token
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

// Clear all auth data (logout)
window.chessAuthModule.clearAuth = function() {
  try {
    localStorage.removeItem('chess_assistant_auth');
    localStorage.removeItem('chess_assistant_token');
    
    // Also clear any other related items
    localStorage.removeItem('chess_assistant_auth_updated');
    
    // Notify the background script about logout
    if (chrome && chrome.runtime) {
      try {
        chrome.runtime.sendMessage({
          action: 'auth_updated',
          data: null
        });
      } catch (error) {
        console.error('Error sending logout message:', error);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing auth data:', error);
    return false;
  }
}

// Login with Google (simple version that checks localStorage for token)
window.chessAuthModule.loginWithGoogle = function() {
  console.log('Checking for auth data from Google login...');
  
  // First check if we already have auth data in localStorage
  // This is set by the callback page after successful Google login
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
  
  // If we don't have valid auth data, we need to start the login process
  // Direct the user to the login URL
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
        chrome.tabs.create({ url: data.url });
        
        // Set up a localStorage event listener to detect when auth is completed
        const storageListener = (event) => {
          if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token') {
            // Auth data has changed - check if we have a valid token now
            const newAuthData = window.chessAuthModule.getAuthData();
            if (newAuthData && newAuthData.token) {
              window.removeEventListener('storage', storageListener);
              clearTimeout(timeout);
              resolve(newAuthData);
            }
          }
        };
        
        window.addEventListener('storage', storageListener);
        
        // Set a timeout to avoid hanging indefinitely
        const timeout = setTimeout(() => {
          window.removeEventListener('storage', storageListener);
          reject(new Error('Login timed out. Please try again.'));
        }, 120000); // 2 minute timeout
      })
      .catch(error => {
        console.error('Login error:', error);
        reject(error);
      });
  });
}

// Fetch user data from the server
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

// Validate token with the server
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

// Validate stored auth and refresh if needed
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

// Get available credit packages
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

// Open payment page for package
window.chessAuthModule.openPaymentPage = function(packageId) {
  const token = window.chessAuthModule.getAuthToken();
  if (!token) {
    return Promise.reject(new Error('No auth token available'));
  }
  
  // Open the payment page in a new tab
  const paymentUrl = `${API_URL}/payments/payment-page?package_id=${packageId}`;
  chrome.tabs.create({ url: paymentUrl });
  
  // Set up listener for payment completion
  return new Promise((resolve, reject) => {
    const storageListener = (event) => {
      if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token') {
        // Auth data has changed - this could be due to payment completion
        const authData = window.chessAuthModule.getAuthData();
        if (authData && authData.user) {
          window.removeEventListener('storage', storageListener);
          clearTimeout(timeout);
          resolve(authData.user);
        }
      }
    };
    
    window.addEventListener('storage', storageListener);
    
    // Set a timeout to avoid hanging indefinitely
    const timeout = setTimeout(() => {
      window.removeEventListener('storage', storageListener);
      reject(new Error('Payment timed out. Please check your account to verify if payment was successful.'));
    }, 300000); // 5 minute timeout
  });
}

// Initialize when the script loads
console.log('Auth storage module initialized');

// Check for auth data in localStorage
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

// Listen for storage changes to detect auth updates from callback page
window.addEventListener('storage', event => {
  if (event.key === 'chess_assistant_auth' || event.key === 'chess_assistant_token') {
    console.log(`Auth data changed in localStorage (key: ${event.key})`);
    // Notify listeners about the auth change
    const authEvent = new CustomEvent('auth_changed', {
      detail: window.chessAuthModule.getAuthData()
    });
    window.dispatchEvent(authEvent);
  } else if (event.key === 'chess_assistant_auth_updated') {
    console.log('Auth update detected');
    // Refresh the auth data in memory/UI
    const authData = window.chessAuthModule.getAuthData();
    const authEvent = new CustomEvent('auth_changed', {
      detail: authData
    });
    window.dispatchEvent(authEvent);
  }
});