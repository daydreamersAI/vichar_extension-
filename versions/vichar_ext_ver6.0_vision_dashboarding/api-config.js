// API Configuration for Chess Analysis Extension
// This file centralizes API configuration for easier updates

// Import PostHog tracking utility 
// Import path is relative to where this file is used
import { trackEvent } from './src/utils/analytics.js';

// Updated to match your deployed FastAPI server
const API_CONFIG = {
  // Base URL for API access
  baseUrl: "https://api.beekayprecision.com",
  
  // Endpoints
  endpoints: {
    analysis: "/analysis",
    analysisWithCredit: "/analysis-with-credit",
    validateFen: "/validate/fen",
    validatePgn: "/validate/pgn",
    convertFenToPgn: "/convert/fen-to-pgn",
    register: "/register",
    login: "/login",
    // Payment endpoints
    creditPackages: "/payments/credits/packages",
    createOrder: "/credits/create-order",
    verifyPayment: "/credits/verify-payment",
    userCredits: "/credits/balance",
    health: "/health"
  },
  
  // Razorpay configuration
  razorpay: {
    keyId: "rzp_test_JB7DxS1VpotPXc", // Replace with your actual key in production
  },
  
  // Request timeout in milliseconds
  timeout: 60000, // Increased timeout for vision model processing
  
  // Default headers
  headers: {
    "Content-Type": "application/json"
  }
};

// Helper function to build full API URLs
function getApiUrl(endpoint) {
  return `${API_CONFIG.baseUrl}${endpoint}`;
}

// Helper function to get authentication headers
function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  const headers = { ...API_CONFIG.headers };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
}

// Helper function to make API calls
async function callApi(endpoint, data, method = 'POST') {
  const url = getApiUrl(endpoint);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    
    // Track API call initiated
    if (typeof trackEvent === 'function') {
      trackEvent('api_call_initiated', {
        endpoint: endpoint,
        method: method
      });
    }
    
    const response = await fetch(url, {
      method: method,
      headers: getAuthHeaders(),
      body: method !== 'GET' ? JSON.stringify(data) : undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      // Track API call failed
      if (typeof trackEvent === 'function') {
        trackEvent('api_call_failed', {
          endpoint: endpoint,
          method: method,
          status: response.status,
          statusText: response.statusText
        });
      }
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    // Track API call success
    if (typeof trackEvent === 'function') {
      trackEvent('api_call_succeeded', {
        endpoint: endpoint,
        method: method
      });
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
    // Track API call error (for network/timeout errors)
    if (typeof trackEvent === 'function' && !error.message.startsWith('API error')) {
      trackEvent('api_call_error', {
        endpoint: endpoint,
        method: method,
        error: error.message
      });
    }
    throw error;
  }
}

// Function specifically for the analysis endpoint with vision support
async function analyzePosition(message, fen, imageData = null, pgn = null, chatHistory = []) {
  return callApi(API_CONFIG.endpoints.analysis, {
    message: message,
    fen: fen,
    pgn: pgn,
    image_data: imageData, // Now we pass the image data for vision model
    chat_history: chatHistory
  });
}

// Function for analysis with credit deduction
async function analyzeWithCredit(message, fen, imageData = null, pgn = null, chatHistory = []) {
  return callApi(API_CONFIG.endpoints.analysisWithCredit, {
    message: message,
    fen: fen,
    pgn: pgn,
    image_data: imageData,
    chat_history: chatHistory
  });
}

// Authentication functions
async function registerUser(email, password, name) {
  return callApi(API_CONFIG.endpoints.register, {
    email: email,
    password: password,
    name: name
  });
}

async function loginUser(email, password) {
  return callApi(API_CONFIG.endpoints.login, {
    email: email,
    password: password
  });
}

// Payment functions
async function getCreditPackages() {
  return callApi(API_CONFIG.endpoints.creditPackages, {}, 'GET');
}

async function createOrder(packageId) {
  return callApi(API_CONFIG.endpoints.createOrder, {
    package_id: packageId
  });
}

async function verifyPayment(paymentData) {
  return callApi(API_CONFIG.endpoints.verifyPayment, paymentData);
}

async function getUserCredits() {
  return callApi(API_CONFIG.endpoints.userCredits, {}, 'GET');
}

// Helper function to store authentication token
function storeAuthToken(token) {
  // Store in localStorage for content script access
  localStorage.setItem('auth_token', token.access_token);
  localStorage.setItem('user_id', token.user_id);
  localStorage.setItem('user_name', token.name);
  
  // Also store in chrome.storage.local for background script access
  chrome.storage.local.set({
    'auth_token': token.access_token,
    'user_id': token.user_id,
    'user_name': token.name
  });
}

// Helper function to get authentication token
function getAuthToken() {
  return localStorage.getItem('auth_token');
}

// Helper function to check if user is logged in
function isLoggedIn() {
  return !!getAuthToken();
}

// Helper function to logout user
function logoutUser() {
  // Clear from localStorage
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_name');
  
  // Also clear from chrome.storage.local
  chrome.storage.local.remove(['auth_token', 'user_id', 'user_name']);
}

// Export functions and configuration
export {
  API_CONFIG,
  getApiUrl,
  callApi,
  analyzePosition,
  analyzeWithCredit,
  registerUser,
  loginUser,
  getCreditPackages,
  createOrder,
  verifyPayment,
  getUserCredits,
  storeAuthToken,
  getAuthToken,
  isLoggedIn,
  logoutUser
};