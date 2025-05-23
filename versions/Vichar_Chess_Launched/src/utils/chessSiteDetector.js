/**
 * Utility functions for detecting chess sites and their board elements
 */

export const ChessSiteDetector = {
  /**
   * Detects which chess site we're on and returns the appropriate board selector
   * @returns {string|null} The CSS selector for the chess board, or null if not a supported site
   */
  detectChessSite() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('lichess.org')) {
      return '.cg-wrap'; // Lichess board container
    } else if (hostname.includes('chess.com')) {
      return '.board'; // Chess.com board container
    }
    
    // Not a supported chess site
    return null;
  },

  /**
   * Checks if the current site is supported
   * @returns {boolean} True if the current site is supported
   */
  isSupportedSite() {
    return this.detectChessSite() !== null;
  }
}; 