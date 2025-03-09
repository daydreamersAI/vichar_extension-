// auth-storage.js - Simplified authentication module

(function() {
  // Use a self-executing function to avoid polluting the global scope
  try {
    // Log initialization for debugging
    console.log("Auth storage module initializing...");
    
    // Ensure we have a valid context - use self, window, or global depending on environment
    const globalContext = (typeof self !== 'undefined' ? self : 
                          (typeof window !== 'undefined' ? window : 
                          (typeof global !== 'undefined' ? global : {})));
    
    // Create a global module object - this makes it accessible from content scripts too
    globalContext.chessAuthModule = globalContext.chessAuthModule || {};
    
    // Set initialization flag immediately
    globalContext.chessAuthModule.isInitialized = true;
    
    // API URL configuration
    globalContext.API_URL = globalContext.API_URL || 'https://api.beekayprecision.com';
    
    // Add a cache for auth data to avoid repeated storage access
    globalContext.chessAuthModule._cachedAuthData = null;
    
    console.log("Auth module base initialization complete");
    
    // ====================== AUTH HELPER FUNCTIONS ======================
    
    // Check if user is authenticated
    globalContext.chessAuthModule.isAuthenticated = async function() {
      try {
        const authData = await globalContext.chessAuthModule.getAuthData();
        return !!authData && !!authData.token;
      } catch (error) {
        console.error('Error checking authentication:', error);
        return false;
      }
    };
    
    // Synchronous version for when async isn't possible
    globalContext.chessAuthModule.isAuthenticatedSync = function() {
      try {
        // Safely check localStorage
        if (typeof localStorage === 'undefined') return false;
        
        let authDataStr = localStorage.getItem('chess_assistant_auth');
        if (!authDataStr) return false;
        
        const authData = JSON.parse(authDataStr);
        return !!authData && !!authData.token;
      } catch (error) {
        console.error('Error in isAuthenticatedSync:', error);
        return false;
      }
    };
    
    console.log("Auth module functions being added...");
    
    // Get auth data from all possible storage locations
    globalContext.chessAuthModule.getAuthData = async function() {
      // First check if we have cached data
      if (globalContext.chessAuthModule._cachedAuthData) {
        return globalContext.chessAuthModule._cachedAuthData;
      }
      
      try {
        // Try chrome.storage.local first, then fall back to localStorage
        let authData = null;
        
        // Try Chrome storage if available
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            const data = await chrome.storage.local.get(['authToken', 'userData']);
            
            if (data.authToken) {
              authData = {
                isAuthenticated: true,
                token: data.authToken,
                user: data.userData || {}
              };
              console.log('Auth data loaded from chrome.storage');
            }
          } catch (chromeErr) {
            console.error('Error accessing chrome.storage:', chromeErr);
          }
        }
        
        // If no data from Chrome storage, try localStorage
        if (!authData && typeof localStorage !== 'undefined') {
          try {
            const authDataStr = localStorage.getItem('chess_assistant_auth');
            
            if (authDataStr) {
              authData = JSON.parse(authDataStr);
              console.log('Auth data loaded from localStorage');
            } else {
              // Try the token format as a fallback
              const tokenDataStr = localStorage.getItem('chess_assistant_token');
              
              if (tokenDataStr) {
                const tokenData = JSON.parse(tokenDataStr);
                
                authData = {
                  isAuthenticated: true,
                  token: tokenData.access_token || tokenData.token,
                  user: tokenData.user || {}
                };
                console.log('Auth data loaded from token in localStorage');
              }
            }
          } catch (e) {
            console.error('Error accessing localStorage:', e);
          }
        }
        
        // Cache the data for next time
        globalContext.chessAuthModule._cachedAuthData = authData;
        return authData;
      } catch (error) {
        console.error('Error getting auth data:', error);
        return null;
      }
    };
    
    // Get the current authenticated user
    globalContext.chessAuthModule.getCurrentUser = async function() {
      try {
        const authData = await globalContext.chessAuthModule.getAuthData();
        return authData ? authData.user : null;
      } catch (error) {
        console.error('Error getting current user:', error);
        return null;
      }
    };
    
    // Get the auth token
    globalContext.chessAuthModule.getAuthToken = async function() {
      try {
        const authData = await globalContext.chessAuthModule.getAuthData();
        return authData ? authData.token : null;
      } catch (error) {
        console.error('Error getting auth token:', error);
        return null;
      }
    };
    
    // Clear all authentication data (logout)
    globalContext.chessAuthModule.clearAuth = async function() {
      try {
        // Clear localStorage if available
        if (typeof localStorage !== 'undefined') {
          try {
            localStorage.removeItem('chess_assistant_auth');
            localStorage.removeItem('chess_assistant_token');
            localStorage.removeItem('chess_assistant_auth_updated');
          } catch (e) {
            console.error('Error clearing localStorage:', e);
          }
        }
        
        // Clear Chrome storage if available
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            await chrome.storage.local.remove(['authToken', 'userData', 'authTimestamp']);
          } catch (e) {
            console.error('Error clearing chrome.storage:', e);
          }
        }
        
        // Clear cache
        globalContext.chessAuthModule._cachedAuthData = null;
        
        console.log('Auth data cleared');
        
        // Dispatch event to notify other parts of the extension if we have window
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('chess_auth_changed', { 
              detail: { isAuthenticated: false } 
            }));
          } catch (e) {
            console.error('Error dispatching event:', e);
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error clearing auth:', error);
        return false;
      }
    };
    
    // Save authentication data
    globalContext.chessAuthModule.saveAuthData = async function(authData) {
      try {
        if (!authData || !authData.token) {
          console.error('Invalid auth data provided:', authData);
          return false;
        }
        
        // Format the data consistently
        const standardAuthData = {
          isAuthenticated: true,
          token: authData.token || authData.access_token,
          user: authData.user || {}
        };
        
        // Save to localStorage if available
        if (typeof localStorage !== 'undefined') {
          try {
            // Save to localStorage
            localStorage.setItem('chess_assistant_auth', JSON.stringify(standardAuthData));
            
            // Also save the original format for compatibility
            if (typeof authData === 'object') {
              localStorage.setItem('chess_assistant_token', JSON.stringify(authData));
            }
            
            // Update timestamp to trigger storage events
            localStorage.setItem('chess_assistant_auth_updated', Date.now().toString());
          } catch (e) {
            console.error('Error saving to localStorage:', e);
          }
        }
        
        // Save to Chrome storage if available
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            await chrome.storage.local.set({
              'authToken': standardAuthData.token,
              'userData': standardAuthData.user,
              'authTimestamp': Date.now()
            });
          } catch (e) {
            console.error('Error saving to chrome.storage:', e);
          }
        }
        
        // Update cache
        globalContext.chessAuthModule._cachedAuthData = standardAuthData;
        
        console.log('Auth data saved successfully');
        
        // Dispatch event to notify other parts of the extension if window exists
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('chess_auth_changed', { 
              detail: { isAuthenticated: true, user: standardAuthData.user } 
            }));
          } catch (e) {
            console.error('Error dispatching event:', e);
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error saving auth data:', error);
        return false;
      }
    };
    
    // Login with username and password
    globalContext.chessAuthModule.loginWithCredentials = async function(username, password) {
      try {
        console.log('Attempting login with username/password');
        
        // Check for required fields
        if (!username || !password) {
          throw new Error('Username and password are required');
        }
        
        console.log('Sending login request to API');
        
        // Send the login request to the API
        const response = await fetch(`${globalContext.API_URL}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            username: username,
            password: password
          })
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Invalid username or password');
          } else {
            throw new Error(`Login failed with status: ${response.status}`);
          }
        }
        
        // Parse the response
        const authData = await response.json();
        
        if (!authData.access_token) {
          throw new Error('Invalid response from server: no token provided');
        }
        
        console.log('Login successful, saving token');
        
        // Save the token
        await globalContext.chessAuthModule.saveAuthData({
          token: authData.access_token,
          user: authData.user
        });
        
        console.log('Login complete');
        return { success: true, user: authData.user };
      } catch (error) {
        console.error('Login error:', error);
        return { success: false, error: error.message };
      }
    };
    
    // Legacy support for Google login - now just redirects to the new login method
    globalContext.chessAuthModule.loginWithGoogle = async function() {
      console.error('Google login is no longer supported. Please use username/password login.');
      return { success: false, error: 'Google login is disabled. Use username/password instead.' };
    };
    
    // Update user data from the server
    globalContext.chessAuthModule.updateUserData = async function() {
      try {
        const token = await globalContext.chessAuthModule.getAuthToken();
        
        if (!token) {
          console.error('No auth token available for user data update');
          return false;
        }
        
        // Fetch user data from the server
        const response = await fetch(`${globalContext.API_URL}/auth/me`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to get user data: ${response.status}`);
        }
        
        const userData = await response.json();
        
        // Get existing auth data
        const authData = await globalContext.chessAuthModule.getAuthData();
        
        if (!authData) {
          throw new Error('No existing auth data found');
        }
        
        // Update the user data
        authData.user = userData;
        
        // Save the updated data
        await globalContext.chessAuthModule.saveAuthData(authData);
        
        console.log('User data updated successfully');
        return true;
      } catch (error) {
        console.error('Error updating user data:', error);
        return false;
      }
    };
    
    // Get credit packages
    globalContext.chessAuthModule.getCreditPackages = async function() {
      try {
        const token = await globalContext.chessAuthModule.getAuthToken();
        
        if (!token) {
          console.error('No auth token available to fetch credit packages');
          return null;
        }
        
        const response = await fetch(`${globalContext.API_URL}/payment/credits/packages`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch credit packages: ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Error fetching credit packages:', error);
        return null;
      }
    };
    
    // Open payment page for a specific package
    globalContext.chessAuthModule.openPaymentPage = async function(packageId) {
      try {
        const token = await globalContext.chessAuthModule.getAuthToken();
        
        if (!token) {
          console.error('No auth token available to open payment page');
          return { success: false, error: 'Authentication required' };
        }
        
        if (!packageId) {
          return { success: false, error: 'Package ID is required' };
        }
        
        // Open the payment page in a new tab
        const paymentUrl = `${globalContext.API_URL}/payment/payment-page?package_id=${packageId}`;
        
        if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
          await chrome.tabs.create({ url: paymentUrl });
          return { success: true };
        } else if (typeof window !== 'undefined') {
          window.open(paymentUrl, '_blank');
          return { success: true };
        } else {
          return { success: false, error: 'Cannot open payment page in this context' };
        }
      } catch (error) {
        console.error('Error opening payment page:', error);
        return { success: false, error: error.message };
      }
    };
    
    // Listen for storage changes
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', function(event) {
        if (event.key === 'chess_assistant_auth' || 
            event.key === 'chess_assistant_token' || 
            event.key === 'chess_assistant_auth_updated') {
          
          console.log('Auth storage changed, updating cache');
          
          // Clear the cache to force a reload
          globalContext.chessAuthModule._cachedAuthData = null;
          
          // Notify about auth change
          try {
            window.dispatchEvent(new CustomEvent('chess_auth_changed', { 
              detail: { storageChanged: true } 
            }));
          } catch (e) {
            console.error('Error dispatching storage event:', e);
          }
        }
      });
    }
    
    // Log that the module is fully loaded
    console.log('Auth module fully loaded and exported');
    
    // Export the module for other scripts if we're in a module context
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = globalContext.chessAuthModule;
    }

    // Add signup with credentials functionality
    globalContext.chessAuthModule.signupWithCredentials = async function(email, password, fullName) {
      try {
        console.log('Attempting signup with email/password');
        
        // Check for required fields
        if (!email || !password) {
          throw new Error('Email and password are required');
        }
        
        console.log('Sending signup request to API');
        
        // Send the signup request to the API
        const response = await fetch(`${globalContext.API_URL}/auth/signup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            password: password,
            full_name: fullName || ''
          })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (response.status === 400 && errorData.detail && errorData.detail.includes('already registered')) {
            throw new Error('This email is already registered');
          } else {
            throw new Error(errorData.detail || `Signup failed with status: ${response.status}`);
          }
        }
        
        // Parse the response
        const authData = await response.json();
        
        if (!authData.access_token) {
          throw new Error('Invalid response from server: no token provided');
        }
        
        console.log('Signup successful, saving token');
        
        // Save the token
        await globalContext.chessAuthModule.saveAuthData({
          token: authData.access_token,
          user: authData.user
        });
        
        console.log('Signup successful');
        return { success: true, user: authData.user };
      } catch (error) {
        console.error('Signup error:', error);
        return { success: false, error: error.message };
      }
    };
  } catch (error) {
    console.error('Fatal error initializing auth module:', error);
    
    // Still try to create a minimal module to prevent further errors
    const context = (typeof self !== 'undefined' ? self : 
                    (typeof window !== 'undefined' ? window : 
                    (typeof global !== 'undefined' ? global : {})));
    
    if (!context.chessAuthModule) {
      console.log('Creating minimal emergency auth module');
      context.chessAuthModule = {
        isInitialized: true,
        isAuthenticated: async function() { return false; },
        isAuthenticatedSync: function() { return false; },
        getCurrentUser: async function() { return null; },
        getAuthToken: async function() { return null; },
        loginWithCredentials: async function() { return { success: false, error: 'Auth module failed to initialize properly' }; },
        signupWithCredentials: async function() { return { success: false, error: 'Auth module failed to initialize properly' }; }
      };
    }
  }
})();