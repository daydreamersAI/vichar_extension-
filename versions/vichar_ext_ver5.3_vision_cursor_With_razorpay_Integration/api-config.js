// API Configuration for Chess Analysis Extension
// This file centralizes API configuration for easier updates

// Updated to match your deployed FastAPI server
const API_CONFIG = {
  // Base URL for API access
  baseUrl: "https://api.beekayprecision.com",
  
  // Endpoints
  endpoints: {
    analysis: "/analysis",
    validateFen: "/validate/fen",
    validatePgn: "/validate/pgn",
    convertFenToPgn: "/convert/fen-to-pgn",
    register: "/register",
    login: "/login"
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
    
    const response = await fetch(url, {
      method: method,
      headers: getAuthHeaders(),
      body: method !== 'GET' ? JSON.stringify(data) : undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error);
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

// Helper function to store authentication token
function storeAuthToken(token) {
  localStorage.setItem('auth_token', token.access_token);
  localStorage.setItem('user_id', token.user_id);
  localStorage.setItem('user_name', token.name);
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
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_name');
}

// Export functions and configuration
export {
  API_CONFIG,
  getApiUrl,
  callApi,
  analyzePosition,
  registerUser,
  loginUser,
  storeAuthToken,
  getAuthToken,
  isLoggedIn,
  logoutUser
};