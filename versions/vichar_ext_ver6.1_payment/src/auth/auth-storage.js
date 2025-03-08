// auth-storage.js - Updated to work without ES modules

// Add this at the top of your auth-storage.js
console.log("Auth storage module loading...");

// Create a module object that will be accessible globally
window.chessAuthModule = window.chessAuthModule || {};

// Set initialization flag immediately at the top
window.chessAuthModule.isInitialized = true;

// Configuration - use window.API_URL if it exists, otherwise set it
window.API_URL = window.API_URL || 'https://api.beekayprecision.com';

// Add a cache for auth data to avoid repeated storage access
window.chessAuthModule._cachedAuthData = null;

console.log("Auth module set as initialized at load time");

// Check if user is authenticated
window.chessAuthModule.isAuthenticated = async function() {
  try {
    const authData = await window.chessAuthModule.getAuthData();
    return !!authData && !!authData.token;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

// Add a synchronous version for quick checks
window.chessAuthModule.isAuthenticatedSync = function() {
  try {
    // Check cache first
    if (window.chessAuthModule._cachedAuthData) {
      return !!window.chessAuthModule._cachedAuthData.token;
    }
    
    // Fallback to localStorage
    try {
      const authDataStr = localStorage.getItem('chess_assistant_auth');
      if (authDataStr) {
        const authData = JSON.parse(authDataStr);
        // Update cache
        window.chessAuthModule._cachedAuthData = authData;
        return !!authData && !!authData.token;
      }
    } catch (e) {
      console.error("Error reading from localStorage:", e);
    }
    
    return false;
  } catch (error) {
    console.error('Error in sync auth check:', error);
    return false;
  }
}

// Get the current user data
window.chessAuthModule.getCurrentUser = function() {
  try {
    // Check cache first
    if (window.chessAuthModule._cachedAuthData && window.chessAuthModule._cachedAuthData.user) {
      return window.chessAuthModule._cachedAuthData.user;
    }
    
    // Fallback to localStorage
    try {
      const authDataStr = localStorage.getItem('chess_assistant_auth');
      if (authDataStr) {
        const authData = JSON.parse(authDataStr);
        // Update cache
        window.chessAuthModule._cachedAuthData = authData;
        return authData && authData.user ? authData.user : null;
      }
    } catch (e) {
      console.error("Error reading from localStorage:", e);
    }
    
    return null;
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
    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      // First try chrome.storage.local
      return new Promise((resolve) => {
        chrome.storage.local.get(['authToken', 'userData'], (result) => {
          if (result.authToken) {
            resolve({
              isAuthenticated: true,
              token: result.authToken,
              user: result.userData
            });
            return;
          }
          
          // If not in chrome.storage, try localStorage
          tryLocalStorage(resolve);
        });
      });
    } else {
      // Chrome storage not available, use localStorage only
      return new Promise((resolve) => {
        tryLocalStorage(resolve);
      });
    }
  } catch (error) {
    console.error('Error getting auth data:', error);
    return Promise.resolve(null);
  }
  
  // Helper function to try localStorage
  function tryLocalStorage(resolve) {
    let authDataStr = localStorage.getItem('chess_assistant_auth');
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
          resolve(authData);
          return;
        } catch (e) {
          console.error('Error parsing token data:', e);
        }
      }
      resolve(null);
      return;
    }
    
    try {
      resolve(JSON.parse(authDataStr));
    } catch (e) {
      console.error('Error parsing auth data:', e);
      resolve(null);
    }
  }
}

// Set the auth data
window.chessAuthModule.setAuthData = function(data) {
  try {
    // Update cache
    window.chessAuthModule._cachedAuthData = data;
    
    if (!data) {
      // Clear auth data
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove(['authToken', 'userData']);
      }
      localStorage.removeItem('chess_assistant_auth');
      localStorage.removeItem('chess_assistant_token');
      localStorage.removeItem('chess_assistant_auth_updated');
    } else {
      // Store in chrome.storage.local if available
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          'authToken': data.token,
          'userData': data.user
        });
      }
      
      // Store in localStorage
      localStorage.setItem('chess_assistant_auth', JSON.stringify(data));
      
      // Store token data in alternate format
      const tokenData = {
        access_token: data.token,
        token_type: "bearer",
        user: data.user
      };
      localStorage.setItem('chess_assistant_token', JSON.stringify(tokenData));
      
      // Set timestamp for sync
      localStorage.setItem('chess_assistant_auth_updated', Date.now().toString());
    }
    
    // Notify background script
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
    
    // Dispatch event for local listeners
    const authEvent = new CustomEvent('chess_auth_changed', {
      detail: data
    });
    window.dispatchEvent(authEvent);
    
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
    // Clear cache
    window.chessAuthModule._cachedAuthData = null;
    
    // Clear localStorage
    localStorage.removeItem('chess_assistant_auth');
    localStorage.removeItem('chess_assistant_token');
    
    // Notify background script
    try {
      chrome.runtime.sendMessage({
        action: 'logout'
      });
    } catch (e) {
      console.error("Error notifying background of logout:", e);
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing auth:', error);
    return false;
  }
}

// Simplified login with Google that delegates to background script
window.chessAuthModule.loginWithGoogle = function() {
  console.log('Delegating login to background script');
  
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: "login" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Connection to background script failed. Please try again."));
          return;
        }
        
        console.log("Login initiated by background script");
        resolve({ message: "Login window opened" });
      });
    } catch (error) {
      reject(new Error("Failed to initiate login. Please refresh the page and try again."));
    }
  });
}

// Modify the validateToken function to use the background script
window.chessAuthModule.validateToken = function(token) {
  if (!token) return Promise.resolve(false);
  
  // Instead of direct fetch, use chrome.runtime.sendMessage
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({
        action: "validateToken",
        token: token
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Token validation error via background:", chrome.runtime.lastError);
          resolve(false);
          return;
        }
        
        resolve(response && response.isValid);
      });
    } catch (error) {
      console.error("Error sending validation message:", error);
      resolve(false);
    }
  });
}

// Similarly modify fetchUserData to use background script
window.chessAuthModule.fetchUserData = function(token) {
  if (!token) {
    token = window.chessAuthModule.getAuthToken();
    if (!token) {
      return Promise.reject(new Error('No auth token available'));
    }
  }
  
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({
        action: "fetchUserData",
        token: token
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Error fetching user data: " + chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success && response.userData) {
          // Update the stored user data
          window.chessAuthModule.getAuthData().then(authData => {
            if (authData) {
              authData.user = response.userData;
              window.chessAuthModule.setAuthData(authData);
            }
          });
          
          resolve(response.userData);
        } else {
          reject(new Error(response?.error || "Unknown error fetching user data"));
        }
      });
    } catch (error) {
      reject(error);
    }
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

// Do the same for other API calls
window.chessAuthModule.getCreditPackages = function() {
  const token = window.chessAuthModule.getAuthToken();
  if (!token) {
    return Promise.reject(new Error('No auth token available'));
  }
  
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({
        action: "getCreditPackages",
        token: token
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Error fetching packages: " + chrome.runtime.lastError.message));
          return;
        }
        
        if (response && response.success) {
          resolve(response.packages);
        } else {
          reject(new Error(response?.error || "Unknown error fetching packages"));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Open payment page for package
window.chessAuthModule.openPaymentPage = function(packageId) {
  const token = window.chessAuthModule.getAuthToken();
  if (!token) {
    return Promise.reject(new Error('No auth token available'));
  }
  
  // Open the payment page in a new tab
  const paymentUrl = `${window.API_URL}/payments/payment-page?package_id=${packageId}`;
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

// Add periodic validation check
window.chessAuthModule.startAuthValidation = function() {
  // Check auth every 5 minutes
  setInterval(() => {
    if (window.chessAuthModule.isAuthenticated()) {
      window.chessAuthModule.validateStoredAuth()
        .then(isValid => {
          if (!isValid) {
            // Clear auth if invalid
            window.chessAuthModule.clearAuth();
          }
        })
        .catch(error => {
          console.error('Auth validation error:', error);
        });
    }
  }, 5 * 60 * 1000);
}