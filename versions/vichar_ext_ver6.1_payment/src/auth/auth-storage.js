// auth-storage.js - Updated to use chrome.storage for better persistence

// Configuration
const API_URL = 'https://api.beekayprecision.com';

// Check if user is authenticated
export async function isAuthenticated() {
  try {
    const authData = await getAuthData();
    return !!authData && !!authData.token;
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
}

// Get the current user data
export async function getCurrentUser() {
  try {
    const authData = await getAuthData();
    return authData && authData.user ? authData.user : null;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Get the auth token
export async function getAuthToken() {
  try {
    const authData = await getAuthData();
    return authData && authData.token ? authData.token : null;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

// Get the complete auth data
export async function getAuthData() {
  try {
    // First check chrome.storage.local (extension storage)
    return new Promise((resolve) => {
      chrome.storage.local.get(['authToken', 'userData'], (data) => {
        if (data.authToken && data.userData) {
          console.log('Found auth data in chrome.storage');
          resolve({
            isAuthenticated: true,
            token: data.authToken,
            user: data.userData
          });
        } else {
          // If not found in chrome.storage, check localStorage as fallback
          try {
            // Try primary key first
            let authDataStr = localStorage.getItem('chess_assistant_auth');
            
            if (authDataStr) {
              const authData = JSON.parse(authDataStr);
              
              // Also store in chrome.storage for future use
              chrome.storage.local.set({
                'authToken': authData.token,
                'userData': authData.user
              });
              
              console.log('Found auth data in localStorage, copying to chrome.storage');
              resolve(authData);
              return;
            }
            
            // If not found, try alternate key
            const tokenDataStr = localStorage.getItem('chess_assistant_token');
            if (tokenDataStr) {
              const parsedToken = JSON.parse(tokenDataStr);
              const authData = {
                isAuthenticated: true,
                token: parsedToken.access_token,
                user: parsedToken.user
              };
              
              // Store in chrome.storage for future use
              chrome.storage.local.set({
                'authToken': authData.token,
                'userData': authData.user
              });
              
              console.log('Found token data in localStorage, copying to chrome.storage');
              resolve(authData);
              return;
            }
            
            resolve(null);
          } catch (error) {
            console.error('Error checking localStorage:', error);
            resolve(null);
          }
        }
      });
    });
  } catch (error) {
    console.error('Error getting auth data:', error);
    return null;
  }
}

// Set the auth data
export async function setAuthData(data) {
  try {
    if (!data) {
      await chrome.storage.local.remove(['authToken', 'userData']);
      
      // Also clear localStorage as backup
      localStorage.removeItem('chess_assistant_auth');
      localStorage.removeItem('chess_assistant_token');
    } else {
      await chrome.storage.local.set({
        'authToken': data.token,
        'userData': data.user
      });
      
      // Also update localStorage as backup
      localStorage.setItem('chess_assistant_auth', JSON.stringify(data));
      
      // Update alternate format for consistency
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
export async function updateUserData(userData) {
  try {
    const authData = await getAuthData();
    if (authData) {
      authData.user = userData;
      await setAuthData(authData);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating user data:', error);
    return false;
  }
}

// Clear all auth data (logout)
export async function clearAuth() {
  try {
    await chrome.storage.local.remove(['authToken', 'userData']);
    
    // Also clear localStorage
    localStorage.removeItem('chess_assistant_auth');
    localStorage.removeItem('chess_assistant_token');
    
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

// Login with Google (simple version that checks storage for token)
export async function loginWithGoogle() {
  console.log('Checking for auth data from Google login...');
  
  // First check if we already have auth data in storage
  const authData = await getAuthData();
  
  if (authData && authData.token) {
    console.log('Found existing auth data');
    // Validate the token with the server
    try {
      const isValid = await validateToken(authData.token);
      if (isValid) {
        console.log('Existing token is valid');
        return authData;
      } else {
        console.log('Existing token is invalid, clearing');
        await clearAuth();
      }
    } catch (error) {
      console.error('Error validating token:', error);
      // Continue with new login attempt
    }
  }
  
  // If we don't have valid auth data, we need to start the login process
  // This function doesn't actually initiate the process - it just checks for results
  
  // We'll set up a listener for storage changes
  return new Promise((resolve, reject) => {
    // Set a listener for chrome.storage changes
    const storageListener = (changes, area) => {
      if (area === 'local' && (changes.authToken || changes.userData)) {
        console.log('Auth data changed in chrome.storage');
        chrome.storage.local.get(['authToken', 'userData'], async (data) => {
          if (data.authToken && data.userData) {
            // Remove the listener
            chrome.storage.onChanged.removeListener(storageListener);
            clearTimeout(timeout);
            
            resolve({
              isAuthenticated: true,
              token: data.authToken,
              user: data.userData
            });
          }
        });
      }
    };
    
    chrome.storage.onChanged.addListener(storageListener);
    
    // Set a timeout to avoid hanging indefinitely
    const timeout = setTimeout(() => {
      chrome.storage.onChanged.removeListener(storageListener);
      reject(new Error('Login timed out. Please try again.'));
    }, 120000); // 2 minute timeout
  });
}

// Fetch user data from the server
export async function fetchUserData(token) {
  try {
    if (!token) {
      token = await getAuthToken();
      if (!token) {
        throw new Error('No auth token available');
      }
    }
    
    const response = await fetch(`${API_URL}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user data: ${response.status}`);
    }
    
    const userData = await response.json();
    
    // Update the stored user data
    const authData = await getAuthData();
    if (authData) {
      authData.user = userData;
      await setAuthData(authData);
    }
    
    return userData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    throw error;
  }
}

// Validate token with the server
export async function validateToken(token) {
  try {
    if (!token) return false;
    
    const response = await fetch(`${API_URL}/auth/me`, {
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

// Validate stored auth and refresh if needed
export async function validateStoredAuth() {
  const isAuthValid = await isAuthenticated();
  if (isAuthValid) {
    try {
      const token = await getAuthToken();
      if (!token) return false;
      
      // Try a simple validation
      const isValid = await validateToken(token);
      
      if (isValid) {
        // Token is valid, just refresh user data
        try {
          await fetchUserData(token);
        } catch (userDataError) {
          console.error('Error refreshing user data:', userDataError);
          // Continue anyway if we can't refresh user data
        }
        return true;
      } else {
        // If token is invalid, clear auth data
        await clearAuth();
        return false;
      }
    } catch (error) {
      console.error('Auth validation error:', error);
      return false;
    }
  }
  return false;
}

// Initialize when the script loads
if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('Auth storage module initialized with chrome.storage support');
  
  // Check for auth data
  getAuthData().then(authData => {
    if (authData && authData.token) {
      console.log('Found existing auth data on init');
      
      // Validate token
      validateToken(authData.token)
        .then(isValid => {
          if (!isValid) {
            console.log('Token invalid on init, clearing auth');
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
}