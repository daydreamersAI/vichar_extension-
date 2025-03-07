// auth-storage.js - Handles authentication storage and operations

// Configuration
const AUTH_STORAGE_KEY = 'chess_assistant_auth';
const API_URL = 'https://api.beekayprecision.com';

// Check if user is authenticated
export function isAuthenticated() {
  try {
    const authData = getAuthData();
    return !!authData && !!authData.token;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

// Get the current user data
export function getCurrentUser() {
  try {
    const authData = getAuthData();
    return authData && authData.user ? authData.user : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Get the auth token
export function getAuthToken() {
  try {
    const authData = getAuthData();
    return authData && authData.token ? authData.token : null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Get the complete auth data
export function getAuthData() {
  try {
    const authDataStr = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!authDataStr) return null;
    
    return JSON.parse(authDataStr);
  } catch (error) {
    console.error('Error getting auth data:', error);
    return null;
  }
}

// Set the auth data
export function setAuthData(data) {
  try {
    if (!data) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } else {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
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

// Clear all auth data (logout)
export function clearAuth() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    
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
export async function loginWithGoogle() {
  console.log('Checking for auth data from Google login...');
  
  // First check if we already have auth data in localStorage
  // This is set by the callback page after successful Google login
  const authData = getAuthData();
  
  if (authData && authData.token) {
    console.log('Found existing auth data from callback');
    // Validate the token with the server
    try {
      const isValid = await validateToken(authData.token);
      if (isValid) {
        console.log('Existing token is valid');
        return authData;
      } else {
        console.log('Existing token is invalid, clearing');
        clearAuth();
      }
    } catch (error) {
      console.error('Error validating token:', error);
      // Continue with new login attempt
    }
  }
  
  // If we don't have valid auth data, we need to start the login process
  // But this function doesn't actually initiate the process - it just checks for results
  
  // We'll set up a listener for storage changes to detect when the callback page
  // updates the localStorage with new auth data
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      const currentData = getAuthData();
      if (currentData && currentData.token) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve(currentData);
      }
    }, 1000); // Check every second
    
    // Set a timeout to avoid hanging indefinitely
    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Login timed out. Please try again.'));
    }, 120000); // 2 minute timeout
  });
}

// Fetch user data from the server
export async function fetchUserData(token) {
  try {
    if (!token) {
      token = getAuthToken();
      if (!token) {
        throw new Error('No auth token available');
      }
    }
    
    const response = await fetch(`${API_URL}/auth/user`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user data: ${response.status}`);
    }
    
    const userData = await response.json();
    
    // Update the stored user data
    const authData = getAuthData();
    if (authData) {
      authData.user = userData;
      setAuthData(authData);
    }
    
    return userData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

// Validate token with the server
async function validateToken(token) {
  try {
    const response = await fetch(`${API_URL}/auth/validate-token`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Token validation error:', error);
    return false;
  }
}

// Listen for storage changes to detect auth updates from callback page
window.addEventListener('storage', event => {
  if (event.key === AUTH_STORAGE_KEY) {
    console.log('Auth data changed in localStorage');
    // Notify listeners about the auth change
    const authEvent = new CustomEvent('auth_changed', {
      detail: getAuthData()
    });
    window.dispatchEvent(authEvent);
  } else if (event.key === 'chess_assistant_auth_updated') {
    console.log('Auth update detected');
    // Refresh the auth data in memory/UI
    const authData = getAuthData();
    const authEvent = new CustomEvent('auth_changed', {
      detail: authData
    });
    window.dispatchEvent(authEvent);
  }
});

// Also add a listener for messages from the background script
if (chrome && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'auth_state_changed') {
      console.log('Auth state changed message received:', message);
      
      // Update localStorage if needed
      if (message.isAuthenticated && message.user) {
        setAuthData({
          isAuthenticated: true,
          token: message.token || getAuthToken(),
          user: message.user
        });
      } else if (message.isAuthenticated === false) {
        clearAuth();
      }
      
      // Notify listeners
      const authEvent = new CustomEvent('auth_changed', {
        detail: getAuthData()
      });
      window.dispatchEvent(authEvent);
      
      sendResponse({ success: true });
    }
  });
}

// Initialize - check for auth data in localStorage
document.addEventListener('DOMContentLoaded', () => {
  console.log('Auth storage module initialized');
  
  // Check for auth data that might have been set by callback
  const authData = getAuthData();
  if (authData && authData.token) {
    console.log('Found existing auth data on init');
    
    // Validate token
    validateToken(authData.token)
      .then(isValid => {
        if (!isValid) {
          console.log('Token invalid on init, clearing');
          clearAuth();
        } else {
          console.log('Token valid on init');
          
          // Refresh user data
          fetchUserData(authData.token)
            .catch(error => {
              console.error('Error refreshing user data on init:', error);
            });
        }
      })
      .catch(error => {
        console.error('Error validating token on init:', error);
      });
  }
});