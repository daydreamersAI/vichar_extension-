/**
 * Utility functions for capturing the chess board
 */

import { ChessSiteDetector } from './chessSiteDetector.js';

export const BoardCapture = {
  /**
   * Captures the chess board from the page
   * @returns {Promise<string>} A promise that resolves to the image data URL
   * @throws {Error} If the board cannot be captured
   */
  async captureBoardFromPage() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('chess.com')) {
      return this.captureChessComBoard();
    } else {
      return this.captureGenericBoard();
    }
  },

  /**
   * Captures the chess.com board specifically
   */
  async captureChessComBoard() {
    console.log("Attempting to capture chess.com board...");
    
    // First try to get the PGN data
    let pgnData = '';
    try {
      // Try to get PGN from the moves panel
      const movesPanel = document.querySelector('.moves');
      if (movesPanel) {
        const moves = Array.from(movesPanel.querySelectorAll('.move'))
          .map(move => move.textContent.trim())
          .join(' ');
        pgnData = moves;
      }

      // If no moves found, try to get PGN from the game data
      if (!pgnData) {
        const gameData = document.querySelector('script[type="application/json"]');
        if (gameData) {
          try {
            const data = JSON.parse(gameData.textContent);
            if (data.game && data.game.pgn) {
              pgnData = data.game.pgn;
            }
          } catch (e) {
            console.log("Could not parse game data JSON");
          }
        }
      }

      console.log("PGN data found:", pgnData);
    } catch (error) {
      console.log("Error getting PGN:", error);
    }

    // Try to find the board element
    let boardElement = document.querySelector('.board-layout-chessboard') || 
                      document.querySelector('.board-layout-main') ||
                      document.querySelector('.board-vs-pieces') ||
                      document.querySelector('.board');

    if (!boardElement) {
      // If no board found, try to find it by looking for the chess pieces
      const pieces = document.querySelectorAll('.piece');
      if (pieces.length > 0) {
        boardElement = pieces[0].closest('.board-layout-chessboard') ||
                      pieces[0].closest('.board-layout-main') ||
                      pieces[0].closest('.board-vs-pieces') ||
                      pieces[0].closest('.board');
      }
    }

    if (!boardElement) {
      console.log("No board element found. Available elements:", 
        Array.from(document.querySelectorAll('*')).map(el => el.className).filter(Boolean)
      );
      throw new Error("Chess.com board element not found");
    }

    try {
      console.log("Found board element:", boardElement.className);
      const canvas = await html2canvas(boardElement, {
        backgroundColor: null,
        logging: true,
        useCORS: true,
        scale: 2,
        allowTaint: true,
        foreignObjectRendering: true,
        removeContainer: true,
        onclone: (clonedDoc) => {
          // Ensure the board is visible in the cloned document
          const clonedBoard = clonedDoc.querySelector(boardElement.className);
          if (clonedBoard) {
            clonedBoard.style.visibility = 'visible';
            clonedBoard.style.opacity = '1';
          }
        }
      });
      
      // Return both the image and PGN data
      return {
        imageData: canvas.toDataURL('image/png'),
        pgn: pgnData
      };
    } catch (error) {
      console.error("Error capturing chess.com board:", error);
      throw new Error("Failed to capture the chess.com board");
    }
  },

  /**
   * Captures boards from other supported sites
   */
  async captureGenericBoard() {
    const boardSelector = ChessSiteDetector.detectChessSite();
    
    if (!boardSelector) {
      throw new Error("Could not detect a supported chess site");
    }
    
    const boardElement = document.querySelector(boardSelector);
    
    if (!boardElement) {
      throw new Error("Chess board element not found on page");
    }
    
    try {
      const canvas = await html2canvas(boardElement, {
        backgroundColor: null,
        logging: false,
        useCORS: true
      });
      
      return {
        imageData: canvas.toDataURL('image/png'),
        pgn: '' // Empty PGN for non-chess.com sites
      };
    } catch (error) {
      console.error("Error capturing canvas:", error);
      throw new Error("Failed to capture the chess board");
    }
  }
}; 