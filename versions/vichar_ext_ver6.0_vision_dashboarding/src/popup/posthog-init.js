// Simple PostHog event tracking implementation that doesn't load external scripts
// This is a simplified version that only implements the core tracking functionality
window.posthog = {
  _events: [],
  _identities: {},
  
  // Core tracking method
  capture: function(eventName, properties = {}) {
    console.log(`[PostHog] Event captured: ${eventName}`, properties);
    
    // Add user identity if available
    if (this._userId) {
      properties.$user_id = this._userId;
      properties.$user_properties = this._userProps || {};
    }
    
    // Store event for debugging
    this._events.push({
      event: eventName,
      properties: properties,
      timestamp: new Date().toISOString()
    });
    
    // Only try to send if we're in a context where fetch is available
    if (typeof fetch === 'function') {
      // Send to PostHog
      this._sendEvent(eventName, properties);
    }
  },
  
  // User identification
  identify: function(userId, userProps = {}) {
    console.log(`[PostHog] User identified: ${userId}`, userProps);
    this._userId = userId;
    this._userProps = userProps;
    this._identities[userId] = userProps;
  },
  
  // Internal method to send events to PostHog
  _sendEvent: function(eventName, properties) {
    const API_KEY = 'phc_adv1CiTCnHjOooqSr6WC7qFCADeuv4SFJasGXKiRmAe';
    const API_HOST = 'https://us.posthog.com';
    
    const payload = {
      api_key: API_KEY,
      event: eventName,
      properties: {
        ...properties,
        $lib: 'chess-extension-manual',
        distinct_id: this._userId || 'anonymous'
      },
      timestamp: new Date().toISOString()
    };
    
    // Use the connect-src permission to send data
    fetch(`${API_HOST}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.warn('[PostHog] Failed to send event:', err);
    });
  }
};

// Make posthog available globally
console.log('[PostHog] Initialized with CSP-friendly implementation'); 