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
    let boardElement = null;
    
    try {
      // Find the board with comprehensive selectors
      boardElement = document.querySelector('chess-board, div[class^="board"], div[class*="board-"], div[class*="chessboard"], div[data-board], div[id*="board"], .board-b72b1, .board-modal-board, .board-container');
      if (!boardElement) {
        throw new Error("Could not find Chess.com board element");
      }

      // Get orientation
      const orientation = boardElement.classList.contains('flipped') || 
          boardElement.getAttribute('data-orientation') === 'black' ||
          document.querySelector('.board-flipped') ? 'black' : 'white';
      console.log("Board orientation:", orientation);
    
      // 1. Try global objects with updated paths
      try {
        // Method 1: Try to get FEN from the game's internal state
        if (window.ChessComGame?.game?.state?.fen) {
          fen = window.ChessComGame.game.state.fen;
          console.log("Got FEN from ChessComGame.game.state.fen:", fen);
        } else if (window.ChessComGame?.game?.position?.fen) {
          fen = window.ChessComGame.game.position.fen;
          console.log("Got FEN from ChessComGame.game.position.fen:", fen);
        } else if (window.ChessComGame?.game?.fen) {
          fen = typeof window.ChessComGame.game.fen === 'function' ? 
            window.ChessComGame.game.fen() : window.ChessComGame.game.fen;
          console.log("Got FEN from ChessComGame.game.fen:", fen);
        } else if (typeof window.ChessComGame?.game?.getFen === 'function') {
          fen = window.ChessComGame.game.getFen();
          console.log("Got FEN from ChessComGame.game.getFen():", fen);
        } else if (window.game?.getFen) {
          fen = window.game.getFen();
          console.log("Got FEN from window.game.getFen():", fen);
        } else if (window.game?.fen) {
          fen = typeof window.game.fen === 'function' ? window.game.fen() : window.game.fen;
          console.log("Got FEN from window.game.fen:", fen);
        } else if (window.chessboard?.getFen) {
          fen = window.chessboard.getFen();
          console.log("Got FEN from window.chessboard.getFen():", fen);
        } else if (window.chessboard?.fen) {
          fen = typeof window.chessboard.fen === 'function' ? window.chessboard.fen() : window.chessboard.fen;
          console.log("Got FEN from window.chessboard.fen:", fen);
        } else if (window.chess?.getFen) {
          fen = window.chess.getFen();
          console.log("Got FEN from window.chess.getFen():", fen);
        } else if (window.chess?.fen) {
          fen = typeof window.chess.fen === 'function' ? window.chess.fen() : window.chess.fen;
          console.log("Got FEN from window.chess.fen:", fen);
        }
        
        if (fen && isValidFENFormat(fen)) {
          console.log("📊 [Capture] Got valid FEN from global object:", fen);
        } else {
          fen = '';
        }
      } catch (e) {
        console.warn("📊 [Capture] Could not get FEN from global objects:", e);
        fen = '';
      }

      // 2. Try DOM attributes with updated selectors
      if (!fen) {
        try {
          // Try to get FEN directly from board element
          const boardData = boardElement.getAttribute('data-fen') || 
                          boardElement.getAttribute('data-position') ||
                          boardElement.getAttribute('data-board');
          
          if (boardData) {
            try {
              // Try to parse JSON first
              const parsedData = JSON.parse(boardData);
              if (parsedData?.fen && isValidFENFormat(parsedData.fen)) {
                fen = parsedData.fen;
                console.log("Got FEN from parsed board data:", fen);
              }
            } catch (e) {
              // If not JSON, try as raw FEN
              if (boardData.includes('/') && isValidFENFormat(boardData)) {
                fen = boardData;
                console.log("Got FEN from raw board data:", fen);
              }
            }
          }

          // If we still don't have a FEN, try other selectors
          if (!fen) {
            const selectors = [
              '[data-fen]',
              '[data-position]',
              '[data-game-state]',
              '.move.selected[data-fen]',
              '.copy-fen-btn',
              '.share-menu-tab-pgn-textarea',
              '.board-modal-pgn-textarea',
              '.board-modal-fen-textarea',
              '.board-modal-position-textarea',
              '.board-modal-fen',
              '.board-modal-position',
              '.board-modal-state'
            ];
            for (const selector of selectors) {
              const elements = document.querySelectorAll(selector);
              for (const el of elements) {
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
              if (fen) break;
            }
          }
        } catch (e) {
          console.warn("📊 [Capture] Could not get FEN from DOM attributes:", e);
        }
      }

      // 3. Visual extraction with improved board detection
      if (!fen) {
        try {
          console.log("Attempting board state reconstruction from visual elements");
          
          // Try to find pieces using multiple selectors
          const pieceSelectors = [
            'div.piece[class*="square-"]',
            'div[class*="piece-"]',
            'div[class*="square-"] > div[class*="piece"]',
            'div[class*="chess-piece"]',
            'div[class*="piece"][class*="square-"]',
            '.piece', // More generic selectors
            '[class*="piece"]',
            'img[src*="piece"]', // Some chess.com versions use images
            // New Chess.com selectors
            'div[class*="piece_"] > svg',
            'div[class*="piece_"]',
            'chess-board div[class*="piece"]',
            'chess-board div[class*="square-"] div',
            // Even more generic
            'chess-board *[style*="transform"]',
            'chess-board > div > div',
            // New: try all divs with a data-piece attribute
            'div[data-piece]',
            // New: try all divs with a data-square attribute (sometimes used for squares)
            'div[data-square]'
          ];

          let pieces = [];
          for (const selector of pieceSelectors) {
            const foundPieces = Array.from(boardElement.querySelectorAll(selector));
            if (foundPieces.length > 0) {
              pieces = foundPieces;
              console.log(`Found ${pieces.length} pieces using selector: ${selector}`);
              break;
            }
          }

          // If we still didn't find pieces, try parent element just in case
          if (pieces.length === 0) {
            const parentElement = boardElement.parentElement;
            if (parentElement) {
              console.log("Trying parent element for board:", parentElement.tagName, parentElement.className);
              for (const selector of pieceSelectors) {
                const foundPieces = Array.from(parentElement.querySelectorAll(selector));
                if (foundPieces.length > 0) {
                  pieces = foundPieces;
                  console.log(`Found ${pieces.length} pieces using parent element and selector: ${selector}`);
                  break;
                }
              }
            }
          }

          // Fallback: Try all children if no pieces found
          if (pieces.length === 0) {
            pieces = Array.from(boardElement.querySelectorAll('*'));
            console.warn('Fallback: Trying all children of board element, found:', pieces.length);
          }

          console.log('Number of pieces found:', pieces.length);

          if (pieces.length === 0) {
            console.error("No pieces found on the board");
            throw new Error("Could not find chess pieces on the board");
          }

          const boardArray = Array.from({ length: 8 }, () => Array(8).fill(''));
          const boardRect = boardElement.getBoundingClientRect();
          const squareSize = boardRect.width / 8;

          console.log(`Board dimensions: ${boardRect.width}x${boardRect.height}, square size: ${squareSize}`);
          
          let successCount = 0;
          let kingCount = { w: 0, b: 0 };

          // Process each piece
          pieces.forEach((piece, index) => {
            try {
              // Always declare at the very top!
              let fileIdx = -1;
              let rankIdx = -1;
              const classList = piece.className.split(' ');
              
              // Debug logging
              console.log('Piece element:', piece.outerHTML);
              console.log('Class list:', classList);
              console.log('data-piece:', piece.getAttribute('data-piece'));
              console.log('data-square:', piece.getAttribute('data-square'));
              
              // 1. Try standard Chess.com classes
              let pieceType = classList.find(cls => /^[bw][pnbrqk]$/.test(cls)) || 
                          classList.find(cls => /^piece-[bw][pnbrqk]$/.test(cls)) ||
                          classList.find(cls => /^chess-piece-[bw][pnbrqk]$/.test(cls)) ||
                          classList.find(cls => /^[bw][pnbrqk]-piece$/.test(cls));

              // Try to get piece type from data-piece attribute
              if (!pieceType && piece.hasAttribute('data-piece')) {
                const dp = piece.getAttribute('data-piece');
                if (/^[wb][pnbrqk]$/i.test(dp)) {
                  pieceType = dp.toLowerCase();
                }
              }

              // 2. Try alternative format (white/black + king/queen/etc classes)
              let color, type;
              if (!pieceType) {
                // Try to find color in class names
                const colorClass = classList.find(cls => cls === 'white' || cls === 'black') ||
                                 classList.find(cls => cls.includes('white')) || 
                                 classList.find(cls => cls.includes('black'));
                
                // Try to find piece type in class names
                const typeClass = classList.find(cls => ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].includes(cls)) ||
                                classList.find(cls => cls.includes('king')) || 
                                classList.find(cls => cls.includes('queen')) ||
                                classList.find(cls => cls.includes('rook')) ||
                                classList.find(cls => cls.includes('bishop')) ||
                                classList.find(cls => cls.includes('knight')) ||
                                classList.find(cls => cls.includes('pawn'));
                
                if (colorClass && typeClass) {
                  color = colorClass.includes('white') ? 'w' : 'b';
                  if (typeClass.includes('king')) type = 'k';
                  else if (typeClass.includes('queen')) type = 'q';
                  else if (typeClass.includes('rook')) type = 'r';
                  else if (typeClass.includes('bishop')) type = 'b';
                  else if (typeClass.includes('knight')) type = 'n';
                  else if (typeClass.includes('pawn')) type = 'p';
                }
              }
              
              // 3. Try to extract from class names with piece_ prefix (new Chess.com format)
              if (!pieceType && !color && !type) {
                const pieceClass = classList.find(cls => cls.startsWith('piece_'));
                if (pieceClass) {
                  const parts = pieceClass.split('_');
                  if (parts.length >= 3) {
                    // Format might be like piece_color_type
                    color = parts[1].includes('w') ? 'w' : 'b';
                    const typePart = parts[2];
                    if (typePart.includes('k')) type = 'k';
                    else if (typePart.includes('q')) type = 'q';
                    else if (typePart.includes('r')) type = 'r';
                    else if (typePart.includes('b')) type = 'b';
                    else if (typePart.includes('n')) type = 'n';
                    else if (typePart.includes('p')) type = 'p';
                  }
                }
              }
              
              // 4. Try to extract from SVG use element if present
              if (!pieceType && !color && !type && piece.querySelector) {
                const svgUse = piece.querySelector('use');
                if (svgUse) {
                  const href = svgUse.getAttribute('href') || svgUse.getAttribute('xlink:href');
                  if (href) {
                    // Extract color and type from href like #wk or #bp
                    const match = href.match(/#([wb])([pnbrqk])/i);
                    if (match) {
                      color = match[1].toLowerCase();
                      type = match[2].toLowerCase();
                    }
                  }
                }
              }
              
              // Try to get position from class or transform
              // 1. Try square class
              const squareClass = classList.find(cls => /^square-\d{2}$/.test(cls)) ||
                              classList.find(cls => /^square-[a-h][1-8]$/.test(cls)) ||
                              classList.find(cls => /^[a-h][1-8]$/.test(cls));
              
              if (squareClass) {
                console.log(`Piece ${index} has square class: ${squareClass}`);
                if (squareClass.includes('-')) {
                  const sq = squareClass.split('-')[1];
                  if (sq.length === 2 && /^\d{2}$/.test(sq)) {
                    // Handle numeric coordinates (e.g., square-12)
                    fileIdx = parseInt(sq[0], 10) - 1;
                    rankIdx = 8 - parseInt(sq[1], 10);
                  } else {
                    // Handle algebraic coordinates (e.g., square-e4)
                    fileIdx = sq.charCodeAt(0) - 'a'.charCodeAt(0);
                    rankIdx = 8 - parseInt(sq[1], 10);
                  }
                } else {
                  // Handle direct algebraic notation (e.g., e4)
                  fileIdx = squareClass.charCodeAt(0) - 'a'.charCodeAt(0);
                  rankIdx = 8 - parseInt(squareClass[1], 10);
                }
              }
              
              // Try to get square from data-square attribute
              if (piece.hasAttribute('data-square')) {
                const sq = piece.getAttribute('data-square');
                if (/^[a-h][1-8]$/.test(sq)) {
                  fileIdx = sq.charCodeAt(0) - 'a'.charCodeAt(0);
                  rankIdx = 8 - parseInt(sq[1], 10);
                  if (orientation === 'black') {
                    fileIdx = 7 - fileIdx;
                    rankIdx = 7 - rankIdx;
                  }
                }
              }
              
              // 2. If position not found, try transform style
              if (fileIdx < 0 || rankIdx < 0) {
                const transform = piece.style.transform || '';
                console.log(`Piece ${index} transform: ${transform}`);
                
                // Try translate
                const translateMatch = transform.match(/translate(?:3d)?\(\s*([^,]+)px,\s*([^,]+)px/);
                if (translateMatch) {
                  const x = parseFloat(translateMatch[1]);
                  const y = parseFloat(translateMatch[2]);
                  fileIdx = Math.round(x / squareSize);
                  rankIdx = Math.round(y / squareSize);
                  console.log(`Piece ${index} position from translate: [${fileIdx}, ${rankIdx}]`);
                } 
                // Try matrix
                else {
                  const matrixMatch = transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^,\)]+)/);
                  if (matrixMatch) {
                    const x = parseFloat(matrixMatch[1]);
                    const y = parseFloat(matrixMatch[2]);
                    fileIdx = Math.round(x / squareSize);
                    rankIdx = Math.round(y / squareSize);
                    console.log(`Piece ${index} position from matrix: [${fileIdx}, ${rankIdx}]`);
                  }
                }
                
                // Adjust for orientation if needed
                if (fileIdx >= 0 && rankIdx >= 0) {
                  if (orientation === 'black') {
                    fileIdx = 7 - fileIdx;
                    rankIdx = 7 - rankIdx;
                  }
                }
              }
              
              // Skip if position is invalid
              if (fileIdx < 0 || fileIdx > 7 || rankIdx < 0 || rankIdx > 7) {
                console.warn(`Piece ${index} position out of bounds: [${fileIdx}, ${rankIdx}]`);
                return;
              }
              
              // Get the FEN character
              let fenChar;
              if (pieceType) {
                // Method 1: from pieceType
                const pieceChar = pieceType.includes('-') ? pieceType.split('-').pop() : pieceType;
                fenChar = pieceChar[0] === 'w' ? pieceChar[1].toUpperCase() : pieceChar[1];
              } else if (color && type) {
                // Method 2: from separate color and type
                fenChar = color === 'w' ? type.toUpperCase() : type;
              } else {
                // No valid piece type found
                console.warn(`Piece ${index} has invalid type: ${piece.className}`);
                return;
              }
              
              // Place the piece on the board array
              boardArray[rankIdx][fileIdx] = fenChar;
              successCount++;
              if (fenChar.toLowerCase() === 'k') {
                kingCount[fenChar === 'K' ? 'w' : 'b']++;
              }
              
              console.log(`Placed ${fenChar} at [${fileIdx}, ${rankIdx}]`);
            } catch (err) {
              console.warn(`Error processing piece ${index}:`, err);
            }
          });

          console.log('Reconstructed board array:', JSON.stringify(boardArray));
          console.log('Pieces placed successfully:', successCount);
          console.log('King count:', kingCount);

          // Only generate FEN if we found at least some pieces and both kings
          if (successCount > 0 && kingCount.w === 1 && kingCount.b === 1) {
            // Convert board array to FEN notation
            let boardFen = boardArray.map(row => {
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

            // Add the rest of the FEN components
            const isWhiteToMove = !boardElement.classList.contains('flipped');
            fen = `${boardFen} ${isWhiteToMove ? 'w' : 'b'} KQkq - 0 1`;
            
            if (!isValidFENFormat(fen)) {
              console.error("Generated FEN failed validation:", fen);
              throw new Error("Generated invalid FEN string");
            }
            console.log("📊 [Capture] Generated FEN from visual analysis:", fen);
          } else {
            console.error("Incomplete board reconstruction, missing kings or too few pieces.");
            throw new Error("Could not reconstruct a valid chess position");
          }
        } catch (e) {
          console.error("📊 [Capture] Visual board analysis failed:", e);
          throw new Error("Could not extract board position: " + e.message);
        }
      }

      // Get PGN if available
      let pgn = '';
      try {
        const pgnSelectors = [
          '.pgn',
          '.share-menu-tab-pgn-textarea',
          '.board-modal-pgn-textarea',
          '.game-pgn-textarea',
          '.move-list',
          '.moves'
        ];
        for (const selector of pgnSelectors) {
          const pgnElement = document.querySelector(selector);
          if (pgnElement) {
            pgn = pgnElement.value || pgnElement.textContent;
            if (pgn) {
              console.log("📊 [Capture] Found PGN:", pgn);
              break;
            }
          }
        }
      } catch (e) {
        console.warn("📊 [Capture] Could not extract PGN:", e);
      }

      // At this point we should have a valid FEN
      console.log("✅ [Capture] Final FEN:", fen);

      // Capture the board image
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
    } catch (error) {
      console.error("Chess.com board capture failed:", error);
      throw error;
    }
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