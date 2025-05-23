/**
 * Utility functions for capturing the chess board
 */

import { ChessSiteDetector } from './chessSiteDetector.js';

// Helper function to validate FEN string format
function isValidFENFormat(fen) {
  if (!fen || typeof fen !== 'string') return false;

  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) return false;

  const ranks = fields[0].split('/');
  if (ranks.length !== 8) return false;

  for (const rank of ranks) {
    let fileCount = 0;
    for (const char of rank) {
      if (/\d/.test(char)) {
        const num = parseInt(char, 10);
        if (num < 1 || num > 8) return false;
        fileCount += num;
      } else if (/[prnbqkPRNBQK]/.test(char)) {
        fileCount += 1;
      } else {
        return false;
      }
    }
    if (fileCount !== 8) return false;
  }

  if (!/^[wb]$/.test(fields[1])) return false;
  if (!/^(KQ?k?q?|Qk?q?|kq?|q|-)$/.test(fields[2].replace(/[^KQkq-]/g, ''))) return false;
  if (!/^(-|[a-h][36])$/.test(fields[3])) return false;

  return true;
}

export const BoardCapture = {
  /**
   * Captures the chess board from the page
   * @returns {Promise<{success: boolean, data?: {imageData: string, fen: string, pgn: string, orientation: string, site: string}, error?: string}>}
   */
  async captureBoardFromPage() {
    try {
      const hostname = window.location.hostname;
      let result;
      
      // Wait for board to be fully loaded
      let retries = 0;
      const maxRetries = 3;
      const retryDelay = 500; // 500ms between retries
      
      while (retries < maxRetries) {
        try {
          if (hostname.includes('chess.com')) {
            result = await this.captureChessComBoard();
          } else {
            result = await this.captureGenericBoard();
          }
          
          if (result && result.fen && result.fen !== "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1") {
            console.log("✅ [Capture] Successfully captured board position");
            break; // Successfully captured a non-default position
          }
          
          console.log(`📊 [Capture] Attempt ${retries + 1} failed, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retries++;
          
        } catch (error) {
          if (retries === maxRetries - 1) throw error; // Throw on last retry
          console.warn(`📊 [Capture] Attempt ${retries + 1} failed:`, error);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          retries++;
        }
      }

      if (!result || !result.fen) {
        throw new Error("Failed to capture valid board position after multiple attempts");
      }

      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error("Board capture failed:", error);
      return {
        success: false,
        error: error.message || "Failed to capture board"
      };
    }
  },

  /**
   * Captures the chess.com board specifically
   * @returns {Promise<{imageData: string, fen: string, pgn: string, orientation: string, site: string}>}
   */
  async captureChessComBoard() {
    console.log("=== captureChessComBoard running ===");
  
    let fen = '';
    
    // 1. Try global objects
    try {
      if (window.game?.getFen) {
        fen = window.game.getFen();
      } else if (window.game?.fen) {
        fen = typeof window.game.fen === 'function' ? window.game.fen() : window.game.fen;
      } else if (window.ChessComGame?.game?.getFen) {
        fen = window.ChessComGame.game.getFen();
      } else if (window.ChessComGame?.game?.fen) {
        fen = typeof window.ChessComGame.game.fen === 'function' ? window.ChessComGame.game.fen() : window.ChessComGame.game.fen;
      }
      if (fen && isValidFENFormat(fen)) {
        console.log("📊 [Capture] Got FEN from global object:", fen);
      } else {
        fen = '';
      }
    } catch (e) {
      console.warn("📊 [Capture] Could not get FEN from global objects:", e);
    }

    // 2. Try DOM attributes
    if (!fen) {
      try {
        const selectors = [
          '[data-fen]',
          '[data-position]',
          '[data-game-state]',
          '.move.selected[data-fen]',
          '.copy-fen-btn',
          '.share-menu-tab-pgn-textarea'
        ];
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (!el) continue;
          const possibleFen = el.getAttribute('data-fen') ||
                              el.getAttribute('data-position') ||
                              el.getAttribute('data-game-state') ||
                              el.value ||
                              el.textContent;
          if (possibleFen && isValidFENFormat(possibleFen)) {
            fen = possibleFen;
            console.log(`📊 [Capture] Got FEN from ${selector}:`, fen);
            break;
          }
        }
      } catch (e) {
        console.warn("📊 [Capture] Could not get FEN from DOM attributes:", e);
      }
    }

    // 2. Visual extraction for this board structure
    if (!fen) {
      try {
        const board = document.querySelector('wc-chess-board, chess-board, div[class^="board"], div[class*="board-"], div[class*="chessboard"], div[data-board], div[id*="board"], .board-b72b1');
        if (!board) throw new Error("Could not find chess board element");

        const pieces = Array.from(board.querySelectorAll('div.piece[class*="square-"]'));
        console.log('Number of pieces found:', pieces.length);

        const boardArray = Array.from({ length: 8 }, () => Array(8).fill(''));

        pieces.forEach(piece => {
          const classList = piece.className.split(' ');
          const pieceType = classList.find(cls => /^[bw][pnbrqk]$/.test(cls));
          const squareClass = classList.find(cls => /^square-\d{2}$/.test(cls));
          console.log('className:', piece.className, 'pieceType:', pieceType, 'squareClass:', squareClass);
          if (!pieceType || !squareClass) {
            console.warn('Skipping piece, missing type or square:', piece.className);
            return;
          }

          const sq = squareClass.split('-')[1];
          const fileIdx = parseInt(sq[0], 10) - 1; // 0-based file (0=a, 7=h)
          const rankIdx = 8 - parseInt(sq[1], 10); // 0-based rank (0=top, 7=bottom)

          if (fileIdx < 0 || fileIdx > 7 || rankIdx < 0 || rankIdx > 7) {
            console.warn('Skipping piece, out of bounds:', piece.className, fileIdx, rankIdx);
            return;
          }

          const fenChar = pieceType[0] === 'w' ? pieceType[1].toUpperCase() : pieceType[1];
          boardArray[rankIdx][fileIdx] = fenChar;
        });

        console.log('boardArray:', JSON.stringify(boardArray));

        fen = boardArray.map(row => {
          let str = '';
          let empty = 0;
          for (const sq of row) {
            if (!sq) empty++;
            else {
              if (empty) { str += empty; empty = 0; }
              str += sq;
            }
          }
          if (empty) str += empty;
          return str;
        }).join('/');

        console.log('Generated FEN before validation:', fen);

        fen += ' w KQkq - 0 1';
        if (!isValidFENFormat(fen)) throw new Error("Generated invalid FEN string");
        console.log("📊 [Capture] Generated FEN from visual analysis:", fen);
      } catch (e) {
        console.error("📊 [Capture] Visual board analysis failed:", e);
        fen = '';
      }
    }

    if (!fen || !isValidFENFormat(fen)) {
      throw new Error("Could not determine current board position");
    }
    console.log("✅ [Capture] Final FEN:", fen);

    // Get PGN if available
    let pgn = '';
    try {
      const pgnElement = document.querySelector('.pgn, .share-menu-tab-pgn-textarea');
      if (pgnElement) {
        pgn = pgnElement.value || pgnElement.textContent;
        console.log("📊 [Capture] Found PGN:", pgn);
      }
    } catch (e) {
      console.warn("📊 [Capture] Could not extract PGN:", e);
    }

    // Capture the board image
    const boardElement = board;
    const canvas = await html2canvas(boardElement, {
      backgroundColor: null,
      scale: 2,
      logging: false,
      useCORS: true,
      allowTaint: true,
      width: 600,
      height: 600,
      onclone: (doc, element) => {
        element.style.visibility = 'visible';
        element.style.display = 'block';
      }
    });

    return {
      imageData: canvas.toDataURL('image/png'),
      fen: fen,
      pgn: pgn || '',
      orientation: boardElement.classList.contains('flipped') ? 'black' : 'white',
      site: 'chesscom',
      timestamp: Date.now()
    };
  },
  
  /**
   * Captures boards from other supported sites
   * @returns {Promise<{imageData: string, fen: string, pgn: string, orientation: string, site: string}>}
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
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
        width: 600,
        height: 600
      });

      // Try to get FEN if available
      let fen = '';
      try {
        if (window.lichess && window.lichess.analysis && window.lichess.analysis.fen) {
          fen = window.lichess.analysis.fen;
        }
      } catch (e) {
        console.warn("Could not extract FEN:", e);
      }
      
      return {
        imageData: canvas.toDataURL('image/png'),
        fen: fen,
        pgn: '', // Empty PGN for non-chess.com sites
        orientation: 'white', // Default orientation
        site: ChessSiteDetector.getCurrentSite(),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Error capturing canvas:", error);
      throw new Error("Failed to capture the chess board");
    }
  }
}; 