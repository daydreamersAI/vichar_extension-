// This script injects capture functionality dynamically when needed
console.log("Script injector initialized");

// Function to inject the capture script when needed
async function injectCaptureScript(tabId) {
  console.log("Injecting capture script into tab:", tabId);
  
  try {
    // First inject html2canvas
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['lib/html2canvas.min.js']
    });
    
    console.log("html2canvas injected successfully");
    
    // Then inject the capture code
    const result = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: captureChessBoard
    });
    
    console.log("Capture script result:", result);
    
    if (result && result[0] && result[0].result) {
      // Process the captured image data
      await processChessboardImage(result[0].result);
      return { success: true };
    } else {
      throw new Error("Failed to capture chess board");
    }
  } catch (error) {
    console.error("Error injecting capture script:", error);
    return { success: false, error: error.message };
  }
}

// This function is injected into the tab and captures the chess board
function captureChessBoard() {
  console.log("Capture function running in page context");
  
  // Check if we're on Lichess or Chess.com
  const isLichess = window.location.hostname.includes('lichess.org');
  const isChessCom = window.location.hostname.includes('chess.com');
  
  console.log("Site detection:", { isLichess, isChessCom });
  
  // Try to extract PGN data from the page
  let pgn = extractPGN(isLichess, isChessCom);
  
  // Different handling based on the site
  if (isLichess) {
    return captureLichessBoard(pgn);
  } else if (isChessCom) {
    return captureChessComBoard(pgn);
  } else {
    throw new Error("Unsupported chess site");
  }
  
  // Function to extract PGN based on the site
  function extractPGN(isLichess, isChessCom) {
    try {
      let pgn = "";
      
      if (isLichess) {
        // Try multiple methods to find PGN on Lichess
        console.log("Attempting to extract PGN from Lichess");
        
        // Method 1: Direct PGN element in analysis
        const pgnText = document.querySelector('.pgn');
        if (pgnText && pgnText.textContent) {
          console.log("Found PGN text element");
          return pgnText.textContent.trim();
        }
        
        // Method 2: PGN from moves area
        const movesArea = document.querySelector('.analyse__moves, .replay');
        if (movesArea) {
          console.log("Found moves area, extracting moves");
          const moveElements = movesArea.querySelectorAll('.move');
          if (moveElements && moveElements.length > 0) {
            let moveTexts = [];
            let currentMoveNumber = 1;
            let currentTurn = 'w';
            
            // Go through all moves and collect them in proper format
            moveElements.forEach(moveEl => {
              const san = moveEl.getAttribute('data-san') || moveEl.getAttribute('san') || moveEl.textContent.trim();
              if (san) {
                if (currentTurn === 'w') {
                  moveTexts.push(currentMoveNumber + '. ' + san);
                  currentTurn = 'b';
                } else {
                  moveTexts.push(san);
                  currentTurn = 'w';
                  currentMoveNumber++;
                }
              }
            });
            
            if (moveTexts.length > 0) {
              console.log("Extracted " + moveTexts.length + " moves");
              return moveTexts.join(' ');
            }
          }
        }
        
        // Method 3: Look for moves in notation
        const notationItems = document.querySelectorAll('.notation-322V9');
        if (notationItems && notationItems.length > 0) {
          console.log("Found notation items, extracting moves");
          let moveTexts = [];
          let currentMove = '';
          notationItems.forEach(item => {
            const text = item.textContent.trim();
            if (text.match(/^\d+\./)) {
              if (currentMove) moveTexts.push(currentMove);
              currentMove = text;
            } else if (currentMove) {
              currentMove += ' ' + text;
            }
          });
          if (currentMove) moveTexts.push(currentMove);
          if (moveTexts.length > 0) {
            return moveTexts.join(' ');
          }
        }
        
        // Method 4: Check all page text for PGN-like content
        const bodyText = document.body.textContent;
        const pgnRegex = /\b[1-9]\d*\.\s+[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?\s+(?:[KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?\s+)?\b/;
        if (pgnRegex.test(bodyText)) {
          console.log("Found PGN-like content in page text");
          // Extract a sizable chunk around the match
          const match = bodyText.match(new RegExp('(?:' + pgnRegex.source + '.{0,200}){3,}', 'g'));
          if (match && match[0]) {
            return match[0].trim();
          }
        }
      } 
      else if (isChessCom) {
        // Try multiple methods to find PGN on Chess.com
        console.log("Attempting to extract PGN from Chess.com");
        
        // Method 1: Share Menu PGN
        const pgnElement = document.querySelector('.share-menu-tab-pgn-textarea, textarea.copy-pgn');
        if (pgnElement && pgnElement.textContent) {
          console.log("Found PGN in share menu");
          return pgnElement.textContent.trim();
        }
        
        // Method 2: Look for the PGN button and its data
        const pgnButton = document.querySelector('button[data-cy="share-menu-pgn-button"]');
        if (pgnButton) {
          console.log("Found PGN button, attempting to extract data");
          // Sometimes the PGN is stored in data attributes
          const pgnData = pgnButton.getAttribute('data-pgn') || pgnButton.getAttribute('data-clipboard-text');
          if (pgnData) return pgnData;
        }
        
        // Method 3: Global game object direct access
        if (typeof window.ChessComGame !== 'undefined') {
          console.log("Found Chess.com game object");
          if (typeof window.ChessComGame.getPgn === 'function') {
            const gamePgn = window.ChessComGame.getPgn();
            if (gamePgn) return gamePgn;
          }
          // Try to access the game object directly
          if (window.ChessComGame.game && window.ChessComGame.game.pgn) {
            return window.ChessComGame.game.pgn;
          }
        }
        
        // Method 4: Extract from move list elements directly
        const moveList = document.querySelector('.move-list-container, .vertical-move-list');
        if (moveList) {
          console.log("Found move list container");
          const moveElements = moveList.querySelectorAll('.move-text-component, .move');
          if (moveElements.length > 0) {
            console.log("Found " + moveElements.length + " move elements");
            let moveTexts = [];
            let currentMove = '';
            
            moveElements.forEach(move => {
              const text = move.textContent.trim();
              // Check if this is a move number
              if (text.match(/^\d+\.$/)) {
                if (currentMove) moveTexts.push(currentMove);
                currentMove = text + ' ';
              } else if (currentMove) {
                currentMove += text + ' ';
              } else {
                // If we don't have a current move but got a move, start a new one
                currentMove = '1. ' + text + ' ';
              }
            });
            
            if (currentMove) moveTexts.push(currentMove);
            if (moveTexts.length > 0) {
              const pgn = moveTexts.join(' ').trim();
              console.log("Extracted PGN from move list: " + pgn);
              return pgn;
            }
          }
        }
        
        // Method 5: PGN metadata in document head
        const metaTags = document.querySelectorAll('meta');
        for (const tag of metaTags) {
          const content = tag.getAttribute('content');
          if (content && content.includes('1.') && content.match(/[KQRBNP][a-h][1-8]/)) {
            console.log("Found PGN in meta tag");
            return content;
          }
        }
        
        // Method 6: Look for any element with PGN data
        const allElements = document.querySelectorAll('*[data-pgn]');
        for (const el of allElements) {
          const pgnData = el.getAttribute('data-pgn');
          if (pgnData) {
            console.log("Found element with data-pgn attribute");
            return pgnData;
          }
        }
        
        // Method 7: Check for moves in any element
        const movePatternRegex = /\b[1-9]\d*\.\s+([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?)\s+([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?)?/g;
        const textElements = document.querySelectorAll('div, span, p');
        for (const el of textElements) {
          const text = el.textContent;
          if (movePatternRegex.test(text)) {
            const movesMatch = text.match(movePatternRegex);
            if (movesMatch && movesMatch.length > 5) { // At least a few moves to be valid PGN
              console.log("Found PGN-like content in text element");
              return movesMatch.join(' ');
            }
          }
        }
      }
      
      console.log("No PGN found using standard methods");
      
      // Last resort: try to extract moves from the page content
      // Look for move patterns in the entire page
      try {
        const bodyText = document.body.innerText;
        // Match patterns like "1. e4 e5 2. Nf3 Nc6" etc.
        const movePattern = /\b[1-9]\d*\.\s+([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?)\s+(?:([KQRBNP]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[\+#]?))?/g;
        
        const matches = bodyText.match(movePattern);
        if (matches && matches.length > 0) {
          console.log("Found move patterns in page text:", matches.length, "matches");
          // Find the largest consecutive sequence of moves
          let bestMatch = '';
          let currentMatch = '';
          let lastMoveNumber = -1;
          
          for (const match of matches) {
            const moveNumber = parseInt(match.match(/^(\d+)\./)[1]);
            
            if (moveNumber === lastMoveNumber + 1) {
              // Consecutive move
              currentMatch += ' ' + match;
              lastMoveNumber = moveNumber;
            } else {
              // New sequence
              if (currentMatch.length > bestMatch.length) {
                bestMatch = currentMatch;
              }
              currentMatch = match;
              lastMoveNumber = moveNumber;
            }
          }
          
          // Check the last sequence
          if (currentMatch.length > bestMatch.length) {
            bestMatch = currentMatch;
          }
          
          if (bestMatch.length > 0) {
            console.log("Extracted PGN from page text");
            return bestMatch.trim();
          }
        }
      } catch (error) {
        console.error("Error scanning page for move patterns:", error);
      }
      
      // If no PGN found, return empty string
      return pgn;
    } catch (error) {
      console.error("Error extracting PGN:", error);
      return ""; // Return empty string if extraction fails
    }
  }

  // Helper function to validate FEN string format
  function isValidFENFormat(fen) {
    if (!fen || typeof fen !== 'string') return false;
    
    // Basic FEN validation - checks for the expected structure
    // A proper FEN has 6 fields separated by spaces
    const fields = fen.trim().split(/\s+/);
    
    // Most basic check - does it have the right format with ranks separated by slashes?
    if (!fen.includes('/')) return false;
    
    // Check if it has at least some minimum components of a FEN
    if (fields.length >= 1) {
      // Check the board position field (1st field)
      const ranks = fields[0].split('/');
      if (ranks.length !== 8) return false;
      
      // Additional validation if we have more fields
      if (fields.length >= 2) {
        // Check active color (2nd field)
        if (!['w', 'b'].includes(fields[1])) return false;
        
        // If we have the castling field (3rd), check it contains only K, Q, k, q, or -
        if (fields.length >= 3 && !/^[KQkq-]+$/.test(fields[2])) return false;
        
        // If we have the en passant square (4th), check it's valid
        if (fields.length >= 4 && fields[3] !== '-' && !/^[a-h][36]$/.test(fields[3])) return false;
      }
      
      return true;
    }
    
    return false;
  }

  // Enhanced function to extract FEN from Lichess
  function extractLichessFEN() {
    console.log("Extracting FEN from Lichess");
    let fen = "";
    
    // Method 1: FEN from URL parameters
    const fenParam = new URLSearchParams(window.location.search).get('fen');
    if (fenParam) {
      console.log("Found FEN in URL parameter:", fenParam);
      return decodeURIComponent(fenParam);
    }
    
    // Method 2: FEN from path in analysis page URLs
    const fenPathMatch = window.location.pathname.match(/\/analysis\/([^\/]+)/);
    if (fenPathMatch && fenPathMatch[1] && fenPathMatch[1].includes('/')) {
      const possibleFen = fenPathMatch[1].replace(/_/g, ' ');
      if (isValidFENFormat(possibleFen)) {
        console.log("Found FEN in URL path:", possibleFen);
        return possibleFen;
      }
    }
    
    // Method 3: Copyable FEN element
    const fenElements = document.querySelectorAll('.copyable');
    for (const el of fenElements) {
      if (el.textContent && el.textContent.includes('/') && isValidFENFormat(el.textContent.trim())) {
        console.log("Found FEN in copyable element:", el.textContent.trim());
        return el.textContent.trim();
      }
    }
    
    // Method 4: From data-fen attribute on any element
    const fenDataElements = document.querySelectorAll('[data-fen]');
    for (const el of fenDataElements) {
      const fenData = el.getAttribute('data-fen');
      if (fenData && isValidFENFormat(fenData)) {
        console.log("Found FEN in data-fen attribute:", fenData);
        return fenData;
      }
    }
    
    // Method 5: From board wrapper element
    const cgBoard = document.querySelector('cg-board');
    if (cgBoard) {
      const fenData = cgBoard.getAttribute('data-fen') || cgBoard.getAttribute('fen');
      if (fenData && isValidFENFormat(fenData)) {
        console.log("Found FEN in board element:", fenData);
        return fenData;
      }
    }
    
    // Method 6: From Lichess global variables
    if (window.LichessAnalyse && window.LichessAnalyse.data && window.LichessAnalyse.data.game && window.LichessAnalyse.data.game.fen) {
      console.log("Found FEN in LichessAnalyse data:", window.LichessAnalyse.data.game.fen);
      return window.LichessAnalyse.data.game.fen;
    }
    
    // Method 7: Look for FEN in any element with class 'fen'
    const fenClassElements = document.querySelectorAll('.fen');
    for (const el of fenClassElements) {
      if (el.textContent && isValidFENFormat(el.textContent.trim())) {
        console.log("Found FEN in .fen element:", el.textContent.trim());
        return el.textContent.trim();
      }
    }
    
    // Method 8: Last resort - try to look in all script tags for FEN
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || '';
      const fenMatch = content.match(/"fen":\s*"([^"]+)"/);
      if (fenMatch && fenMatch[1] && isValidFENFormat(fenMatch[1])) {
        console.log("Found FEN in script tag:", fenMatch[1]);
        return fenMatch[1];
      }
    }
    
    console.log("Could not extract FEN from Lichess, using default starting position");
    return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  }

  // Enhanced function to extract FEN from Chess.com
  function extractChessComFEN() {
    console.log("Extracting FEN from Chess.com");
    let fen = "";
    
    // Method 1: Access Chess.com's global chess board instance
    if (window.chessboard && typeof window.chessboard.getFen === 'function') {
      try {
        fen = window.chessboard.getFen();
        if (fen && isValidFENFormat(fen)) {
          console.log("Found FEN via global chessboard.getFen():", fen);
          return fen;
        }
      } catch (e) {
        console.log("Error accessing chessboard.getFen():", e);
      }
    }
    
    // Method 2: From Chess.com's game controller
    if (window.gameController && window.gameController.getFEN) {
      try {
        fen = window.gameController.getFEN();
        if (fen && isValidFENFormat(fen)) {
          console.log("Found FEN via gameController.getFEN():", fen);
          return fen;
        }
      } catch (e) {
        console.log("Error accessing gameController.getFEN():", e);
      }
    }
    
    // Method 3: From newer Chess.com global game object
    if (typeof ChessboardContext !== 'undefined' && ChessboardContext.gameSetup && ChessboardContext.gameSetup.fen) {
      console.log("Found FEN in ChessboardContext:", ChessboardContext.gameSetup.fen);
      return ChessboardContext.gameSetup.fen;
    }
    
    // Method 4: From data-fen attribute on any element
    const fenDataElements = document.querySelectorAll('[data-fen]');
    for (const el of fenDataElements) {
      const fenData = el.getAttribute('data-fen');
      if (fenData && isValidFENFormat(fenData)) {
        console.log("Found FEN in data-fen attribute:", fenData);
        return fenData;
      }
    }
    
    // Method 5: Try to find it in the chess-board component
    const chessBoardElement = document.querySelector('chess-board');
    if (chessBoardElement) {
      const fenData = chessBoardElement.getAttribute('position') || chessBoardElement.getAttribute('fen');
      if (fenData && isValidFENFormat(fenData)) {
        console.log("Found FEN in chess-board element:", fenData);
        return fenData;
      }
    }
    
    // Method 6: From the URL in analysis mode
    const fenMatch = window.location.search.match(/fen=([^&]+)/);
    if (fenMatch && fenMatch[1]) {
      const decodedFen = decodeURIComponent(fenMatch[1]);
      if (isValidFENFormat(decodedFen)) {
        console.log("Found FEN in URL:", decodedFen);
        return decodedFen;
      }
    }
    
    // Method 7: From the board setup container
    const boardSetup = document.querySelector('.board-setup-position');
    if (boardSetup) {
      const fenInput = boardSetup.querySelector('input');
      if (fenInput && fenInput.value && isValidFENFormat(fenInput.value)) {
        console.log("Found FEN in board setup input:", fenInput.value);
        return fenInput.value;
      }
    }
    
    // Method 8: Look through various newer game objects
    if (window.ChessComGame) {
      if (window.ChessComGame.getFen && typeof window.ChessComGame.getFen === 'function') {
        try {
          fen = window.ChessComGame.getFen();
          if (fen && isValidFENFormat(fen)) {
            console.log("Found FEN via ChessComGame.getFen():", fen);
            return fen;
          }
        } catch (e) {
          console.log("Error accessing ChessComGame.getFen():", e);
        }
      }
      
      // Try the game object itself
      if (window.ChessComGame.game && window.ChessComGame.game.fen) {
        console.log("Found FEN in ChessComGame.game.fen:", window.ChessComGame.game.fen);
        return window.ChessComGame.game.fen;
      }
    }
    
    // Method 9: Last resort - look in script tags for FEN
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || '';
      const fenMatch = content.match(/fen['"]?\s*:\s*['"]([^'"]+)['"]/);
      if (fenMatch && fenMatch[1] && isValidFENFormat(fenMatch[1])) {
        console.log("Found FEN in script tag:", fenMatch[1]);
        return fenMatch[1];
      }
    }
    
    console.log("Could not extract FEN from Chess.com, using default starting position");
    return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  }
  
  // Function to capture board on Lichess
  async function captureLichessBoard(pgn) {
    console.log("Capturing Lichess board");
    
    // Try to find the main board container first
    const mainBoard = document.querySelector('.main-board');
    const roundBoard = document.querySelector('.round__app__board');
    const cgContainer = document.querySelector('cg-container');
    const analyseBoard = document.querySelector('.analyse__board');
    const puzzleBoard = document.querySelector('.puzzle__board');
    
    let boardContainer = mainBoard || roundBoard || cgContainer || analyseBoard || puzzleBoard;
    console.log("Main board container:", boardContainer);
    
    if (!boardContainer) {
      // If we can't find a main container, try to find any cg-wrap element
      boardContainer = document.querySelector('.cg-wrap');
      console.log("Falling back to cg-wrap:", boardContainer);
    }
    
    if (!boardContainer) {
      console.error("Could not find any Lichess board container");
      throw new Error("Chess board container not found on Lichess");
    }
    
    // Try to get the FEN position using enhanced extraction
    let fen = extractLichessFEN();
    console.log("Extracted FEN from Lichess:", fen);
    
    // Extract orientation (which side is at the bottom of the board)
    let orientation = "white";
    const boardElement = document.querySelector('cg-board');
    if (boardElement && boardElement.classList.contains('orientation-black')) {
      orientation = "black";
    }
    
    // Enhance the board for better capture
    return new Promise((resolve, reject) => {
      try {
        // Before capturing, we'll attempt to temporarily enlarge the pieces
        console.log("Preparing for enhanced Lichess capture");
        
        // Create a style element to boost piece size
        const style = document.createElement('style');
        style.textContent = `
          piece {
            transform: scale(1.4) !important;
            z-index: 100 !important;
          }
          square.last-move {
            background-color: rgba(155, 199, 0, 0.41) !important;
          }
          square.selected {
            background-color: rgba(20, 85, 30, 0.5) !important;
          }
        `;
        document.head.appendChild(style);
        
        // Now capture the board with the enhanced pieces
        html2canvas(boardContainer, {
          backgroundColor: null,
          logging: true,
          useCORS: true,
          allowTaint: true,
          scale: 3, // Even higher quality for Lichess
          ignoreElements: function(element) {
            // Ignore coordinate labels and other non-board elements
            return element.classList.contains('coordinates') || 
                   element.classList.contains('promotion-choice') ||
                   element.classList.contains('coord');
          },
          onclone: function(clonedDoc, clonedElement) {
            console.log("Preparing cloned document for enhanced Lichess capture");
            
            // Find the cg-container in the cloned document
            const clonedContainer = clonedElement.querySelector('cg-container') || clonedElement;
            
            // Find the board element
            const board = clonedContainer.querySelector('cg-board');
            if (board) {
              // Ensure the board is visible
              board.style.opacity = '1';
              board.style.display = 'block';
            }
            
            // Find all pieces in the cloned document
            const pieces = clonedContainer.querySelectorAll('piece');
            console.log(`Found ${pieces.length} pieces in the cloned document`);
            
            // Make sure all pieces are visible and properly sized
            pieces.forEach(piece => {
              // Make pieces more visible
              piece.style.opacity = '1';
              piece.style.transform = 'scale(1.4)';
              piece.style.zIndex = '100';
              
              // Ensure piece backgrounds are displayed properly
              if (piece.style.backgroundImage) {
                piece.style.backgroundSize = 'contain';
                piece.style.backgroundRepeat = 'no-repeat';
                piece.style.backgroundPosition = 'center';
              }
            });
            
            // Find and enhance move indicators (highlighted squares)
            const squares = clonedContainer.querySelectorAll('square');
            squares.forEach(square => {
              if (square.classList.contains('last-move')) {
                square.style.backgroundColor = 'rgba(155, 199, 0, 0.41)';
              }
              if (square.classList.contains('selected')) {
                square.style.backgroundColor = 'rgba(20, 85, 30, 0.5)';
              }
            });
          }
        }).then(canvas => {
          // Clean up - remove the style element
          style.remove();
          
          console.log("Lichess board captured successfully");
          const imageData = canvas.toDataURL('image/png');
          
          // Return both the image and metadata
          resolve({
            imageData,
            pgn,
            fen,
            orientation,
            site: 'lichess'
          });
        }).catch(error => {
          // Clean up even if there's an error
          style.remove();
          
          console.error("html2canvas error on Lichess:", error);
          reject(error);
        });
      } catch (error) {
        console.error("Capture error on Lichess:", error);
        reject(error);
      }
    });
  }
  
  // Function to capture board on Chess.com
  async function captureChessComBoard(pgn) {
    console.log("Capturing Chess.com board");
    
    // Chess.com-specific selectors, ordered by preference
    const selectors = [
      '.board-container', // Common board container
      '.board', // Direct board element
      '.chessboard', // Alternative board name
      'chess-board', // Custom element on newer versions
      'wc-chess-board', // Another custom element
      '#board', // Board by ID
      '#chess_com_chessboard_1', // Specific board ID
      '.board-component-container', // Component container
      '.board-layout-component' // Layout container
    ];
    
    // Try each selector
    let boardElement = null;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Found Chess.com board with selector: ${selector}`);
        boardElement = element;
        break;
      }
    }
    
    if (!boardElement) {
      console.error("Could not find Chess.com board with any selector");
      throw new Error("Chess board element not found on Chess.com");
    }
    
    // Try to get the FEN position using enhanced extraction
    let fen = extractChessComFEN();
    console.log("Extracted FEN from Chess.com:", fen);
    
    // Determine board orientation
    let orientation = "white";
    const isFlipped = boardElement.classList.contains('flipped') || 
                      document.querySelector('.flip-board.flipped');
    if (isFlipped) {
      orientation = "black";
    }
    
    // Special handling for chess-board custom element
    if (boardElement.tagName === 'CHESS-BOARD') {
      console.log("Found chess-board custom element");
      // If it has shadow DOM, we need to handle differently
      if (boardElement.shadowRoot) {
        console.log("Shadow DOM detected, using parent element");
        // Instead of trying to penetrate shadow DOM, use the parent
        const parent = boardElement.parentElement;
        if (parent) {
          boardElement = parent;
        }
      }
    }
    
    // Use html2canvas with specific options for Chess.com
    return new Promise((resolve, reject) => {
      try {
        html2canvas(boardElement, {
          backgroundColor: null,
          logging: true,
          useCORS: true,
          allowTaint: true,
          scale: 1.5 // Good quality for Chess.com
        }).then(canvas => {
          console.log("Chess.com board captured successfully");
          const imageData = canvas.toDataURL('image/png');
          
          // Return both the image and metadata
          resolve({
            imageData,
            pgn,
            fen,
            orientation,
            site: 'chess.com'
          });
        }).catch(error => {
          console.error("html2canvas error on Chess.com:", error);
          reject(error);
        });
      } catch (error) {
        console.error("Capture error on Chess.com:", error);
        reject(error);
      }
    });
  }
}

// Process the captured chessboard image
async function processChessboardImage(captureResult) {
  if (!captureResult) {
    throw new Error("No capture result received");
  }
  
  // Extract data from the capture result
  const { imageData, pgn, fen, orientation, site } = captureResult;
  
  if (!imageData) {
    throw new Error("No image data received");
  }
  
  try {
    console.log("Storing captured board data");
    console.log("PGN data:", pgn ? "Found" : "Not found");
    console.log("FEN data:", fen ? fen : "Not found");
    
    // Store the image data and game information for use in the analysis page
    await chrome.storage.local.set({ 
      capturedBoard: {
        imageData: imageData,
        pgn: pgn || "",
        fen: fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", // Default if not found
        orientation: orientation || "white",
        site: site || "unknown",
        timestamp: Date.now()
      }
    });
    
    console.log("Board data stored successfully");
    return { success: true };
  } catch (error) {
    console.error("Error storing chess position:", error);
    throw error;
  }
}

// Export the function for use in other modules
export { injectCaptureScript };
