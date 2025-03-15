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
    convertFenToPgn: "/convert/fen-to-pgn"
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

// Helper function to make API calls
async function callApi(endpoint, data, method = 'POST') {
  const url = getApiUrl(endpoint);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    
    const response = await fetch(url, {
      method: method,
      headers: API_CONFIG.headers,
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

// Export functions and configuration
export {
  API_CONFIG,
  getApiUrl,
  callApi,
  analyzePosition
};