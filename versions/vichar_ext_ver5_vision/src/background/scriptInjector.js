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
export { injectCaptureScript };// This script injects capture functionality dynamically when needed
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
        const notationItems = document.querySelectorAll('.notation-322V9, .analyse__move-list, .move-list');
        if (notationItems && notationItems.length > 0) {
          console.log("Found notation items, extracting moves");
          let moveTexts = [];
          let currentMove = '';
          
          // Try to extract from all potential notation elements
          for (const container of notationItems) {
            // Get all move text nodes
            const moveNodes = container.querySelectorAll('move, .move, san, .san, l4x, .l4x');
            if (moveNodes && moveNodes.length > 0) {
              console.log(`Found ${moveNodes.length} move nodes`);
              moveNodes.forEach(move => {
                const text = move.textContent.trim();
                if (text) moveTexts.push(text);
              });
            } else {
              // If we can't find specific move elements, try to parse the text content
              const text = container.textContent.trim();
              const movePattern = /\d+\.\s+[a-zA-Z0-9]+(\s+[a-zA-Z0-9]+)?/g;
              const matches = text.match(movePattern);
              if (matches && matches.length > 0) {
                moveTexts = matches;
              }
            }
            
            if (moveTexts.length > 0) break;
          }
          
          if (moveTexts.length > 0) {
            console.log("Processed move texts:", moveTexts);
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
      } else if (isChessCom) {
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
        
        // Method 3: Try looking for share or export elements
        const exportLinks = document.querySelectorAll('a[href*="export"]');
        for (const link of exportLinks) {
          const text = link.textContent.toLowerCase();
          if (text.includes('pgn') || text.includes('export') || text.includes('download')) {
            const hrefAttr = link.getAttribute('href');
            if (hrefAttr && typeof fetch === 'function') {
              try {
                console.log("Found export link, trying to fetch PGN");
                const response = fetch(hrefAttr);
                const data = response.text();
                if (data && data.includes('1.')) {
                  console.log("Successfully fetched PGN data");
                  return data;
                }
              } catch (e) {
                console.log("Error fetching PGN from link:", e);
              }
            }
          }
        }
        
        // Method 4: Global game object direct access
        if (typeof window.ChessComGame !== 'undefined') {
          console.log("Found Chess.com game object");
          if (typeof window.ChessComGame.getPgn === 'function') {
            try {
              const gamePgn = window.ChessComGame.getPgn();
              if (gamePgn) {
                console.log("Got PGN from ChessComGame.getPgn()");
                return gamePgn;
              }
            } catch (e) {
              console.log("Error getting PGN from ChessComGame:", e);
            }
          }
          // Try to access the game object directly
          if (window.ChessComGame.game && window.ChessComGame.game.pgn) {
            console.log("Got PGN from ChessComGame.game.pgn");
            return window.ChessComGame.game.pgn;
          }
        }
        
        // Method 5: Extract from move list elements directly
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
        
        // Method 6: PGN metadata in document head
        const metaTags = document.querySelectorAll('meta');
        for (const tag of metaTags) {
          const content = tag.getAttribute('content');
          if (content && content.includes('1.') && content.match(/[KQRBNP][a-h][1-8]/)) {
            console.log("Found PGN in meta tag");
            return content;
          }
        }
        
        // Method 7: Look for any element with PGN data
        const allElements = document.querySelectorAll('*[data-pgn]');
        for (const el of allElements) {
          const pgnData = el.getAttribute('data-pgn');
          if (pgnData) {
            console.log("Found element with data-pgn attribute");
            return pgnData;
          }
        }
        
        // Method 8: Check for moves in any element
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
            const moveNumberMatch = match.match(/^(\d+)\./);
            if (moveNumberMatch) {
              const moveNumber = parseInt(moveNumberMatch[1]);
              
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

  // Function to extract FEN from Lichess - Enhanced version
  function extractLichessFEN() {
    console.log("Extracting FEN from Lichess using enhanced methods");
    let fen = "";
    
    // Method 1: FEN from global JavaScript variables
    try {
      // Look for LichessAnalyse global variable
      if (typeof window.LichessAnalyse !== 'undefined') {
        if (window.LichessAnalyse.node && window.LichessAnalyse.node.fen) {
          fen = window.LichessAnalyse.node.fen;
          console.log("Found FEN in LichessAnalyse.node.fen:", fen);
          if (isValidFENFormat(fen)) return fen;
        }
        
        if (window.LichessAnalyse.tree && window.LichessAnalyse.tree.root && window.LichessAnalyse.tree.root.fen) {
          fen = window.LichessAnalyse.tree.root.fen;
          console.log("Found FEN in LichessAnalyse.tree.root.fen:", fen);
          if (isValidFENFormat(fen)) return fen;
        }
        
        if (window.LichessAnalyse.data && window.LichessAnalyse.data.game && window.LichessAnalyse.data.game.fen) {
          fen = window.LichessAnalyse.data.game.fen;
          console.log("Found FEN in LichessAnalyse.data.game.fen:", fen);
          if (isValidFENFormat(fen)) return fen;
        }
        
        // Try to access the current position via the current path
        if (window.LichessAnalyse.path && window.LichessAnalyse.tree) {
          const node = window.LichessAnalyse.tree.nodeAtPath(window.LichessAnalyse.path);
          if (node && node.fen) {
            fen = node.fen;
            console.log("Found FEN in current path node:", fen);
            if (isValidFENFormat(fen)) return fen;
          }
        }
      }
      
      // Try accessing other global variables
      if (typeof window.lichess !== 'undefined') {
        if (window.lichess.analyse && window.lichess.analyse.getPosition) {
          try {
            fen = window.lichess.analyse.getPosition();
            console.log("Found FEN via lichess.analyse.getPosition():", fen);
            if (isValidFENFormat(fen)) return fen;
          } catch (e) {
            console.log("Error calling getPosition():", e);
          }
        }
      }
    } catch (e) {
      console.log("Error accessing global variables:", e);
    }
    
    // Method 2: Look for FEN in URL
    try {
      // Check for FEN in URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const fenParam = urlParams.get('fen');
      if (fenParam) {
        fen = decodeURIComponent(fenParam);
        console.log("Found FEN in URL parameter:", fen);
        if (isValidFENFormat(fen)) return fen;
      }
      
      // Check for FEN in URL path
      if (window.location.pathname.includes('/analysis/')) {
        const pathMatch = window.location.pathname.match(/\/analysis\/([^\/]+)/);
        if (pathMatch && pathMatch[1] && pathMatch[1].includes('/')) {
          fen = pathMatch[1].replace(/_/g, ' ');
          console.log("Found FEN in URL path:", fen);
          if (isValidFENFormat(fen)) return fen;
        }
      }
    } catch (e) {
      console.log("Error parsing URL for FEN:", e);
    }
    
    // Method 3: Look for FEN in DOM elements with data attributes
    try {
      // Look for all elements with data-fen attribute
      const fenElements = document.querySelectorAll('[data-fen]');
      for (const el of fenElements) {
        const fenData = el.getAttribute('data-fen');
        if (fenData) {
          console.log("Found element with data-fen:", fenData);
          if (isValidFENFormat(fenData)) return fenData;
        }
      }
      
      // Look for cg-board element
      const cgBoard = document.querySelector('cg-board');
      if (cgBoard) {
        const fenData = cgBoard.getAttribute('data-fen') || cgBoard.getAttribute('fen');
        if (fenData) {
          console.log("Found FEN in cg-board element:", fenData);
          if (isValidFENFormat(fenData)) return fenData;
        }
      }
      
      // Look for analysis-board element
      const analysisBoard = document.querySelector('.analyse__board');
      if (analysisBoard) {
        const fenData = analysisBoard.getAttribute('data-fen');
        if (fenData) {
          console.log("Found FEN in analyse__board element:", fenData);
          if (isValidFENFormat(fenData)) return fenData;
        }
      }
    } catch (e) {
      console.log("Error searching DOM for FEN:", e);
    }
    
    // Method 4: Try to extract from visible notation or board elements
    try {
      // Check for FEN display in any HTML element
      const allElements = document.querySelectorAll('div, span, input');
      for (const el of allElements) {
        // Skip elements with too many children or empty content
        if (el.children.length > 5 || !el.textContent.trim()) continue;
        
        const text = el.textContent.trim();
        // Only check relatively short strings that contain slashes (which are present in FEN)
        if (text.length > 10 && text.length < 100 && text.includes('/')) {
          console.log("Potential FEN string in element:", text);
          if (isValidFENFormat(text)) return text;
        }
        
        // Also check input values
        if (el.tagName === 'INPUT' && el.value) {
          const inputVal = el.value.trim();
          if (inputVal.length > 10 && inputVal.includes('/')) {
            console.log("Potential FEN string in input value:", inputVal);
            if (isValidFENFormat(inputVal)) return inputVal;
          }
        }
      }
    } catch (e) {
      console.log("Error scanning page content for FEN:", e);
    }
    
    // Method 5: Last resort - try to look for FEN in all script tags
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent || '';
        
        // Look for JSON-like patterns containing "fen"
        const fenMatch = content.match(/"fen":\s*"([^"]+)"/);
        if (fenMatch && fenMatch[1]) {
          console.log("Found FEN in script tag:", fenMatch[1]);
          if (isValidFENFormat(fenMatch[1])) return fenMatch[1];
        }
        
        // Also look for direct FEN assignments like fen = '...'
        const fenAssignMatch = content.match(/fen\s*=\s*['"]([^'"]+)['"]/);
        if (fenAssignMatch && fenAssignMatch[1]) {
          console.log("Found FEN assignment in script:", fenAssignMatch[1]);
          if (isValidFENFormat(fenAssignMatch[1])) return fenAssignMatch[1];
        }
      }
    } catch (e) {
      console.log("Error parsing scripts for FEN:", e);
    }
    
    // If we still couldn't find a valid FEN, return the default starting position
    console.log("Could not extract valid FEN from Lichess, using default position");
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
    try {
      if (typeof ChessboardContext !== 'undefined' && ChessboardContext.gameSetup && ChessboardContext.gameSetup.fen) {
        console.log("Found FEN in ChessboardContext:", ChessboardContext.gameSetup.fen);
        return ChessboardContext.gameSetup.fen;
      }
    } catch (e) {
      console.log("Error accessing ChessboardContext:", e);
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
    try {
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
    } catch (e) {
      console.log("Error accessing ChessComGame:", e);
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
  
  // Function to capture board on Lichess with enhanced quality
  async function captureLichessBoard(pgn) {
    console.log("Capturing Lichess board with enhanced method");
    
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
        // Before capturing, we'll create a high-quality clone of the board
        console.log("Preparing for enhanced Lichess capture");
        
        // Create a deep clone of the board container to avoid affecting the original
        const boardClone = boardContainer.cloneNode(true);
        
        // Set up a temporary container with proper dimensions
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.width = '600px';  // Larger size for better quality
        tempContainer.style.height = '600px';
        
        // Apply enhanced styling to the clone
        boardClone.style.width = '100%';
        boardClone.style.height = '100%';
        boardClone.style.overflow = 'hidden';
        
        tempContainer.appendChild(boardClone);
        document.body.appendChild(tempContainer);
        
        // Find all pieces in the cloned board
        const clonedPieces = boardClone.querySelectorAll('piece');
        console.log(`Found ${clonedPieces.length} pieces in the cloned board`);
        
        // Enhance pieces in the clone
        clonedPieces.forEach(piece => {
          piece.style.opacity = '1';
          piece.style.transform = 'scale(1.5)';
          piece.style.zIndex = '100';
          
          // Make sure the piece images are displayed correctly
          if (piece.style.backgroundImage) {
            piece.style.backgroundSize = 'contain';
            piece.style.backgroundRepeat = 'no-repeat';
            piece.style.backgroundPosition = 'center';
          }
        });
        
        // Apply additional CSS to highlight squares
        const styleElement = document.createElement('style');
        styleElement.textContent = `
          #temp-board-container piece {
            transform: scale(1.5) !important;
            opacity: 1 !important;
            z-index: 100 !important;
          }
          #temp-board-container square.last-move {
            background-color: rgba(155, 199, 0, 0.5) !important;
          }
          #temp-board-container square.selected {
            background-color: rgba(20, 85, 30, 0.5) !important;
          }
          #temp-board-container cg-board {
            background-size: cover !important;
          }
        `;
        tempContainer.id = 'temp-board-container';
        document.head.appendChild(styleElement);
        
        // Use html2canvas with specific options for higher quality
        html2canvas(tempContainer, {
          backgroundColor: null,
          logging: true,
          useCORS: true,
          allowTaint: true,
          scale: 3,  // Higher scale factor for better quality
          width: 600,
          height: 600,
          ignoreElements: function(element) {
            // Ignore coordinate labels and other non-board elements
            return element.classList.contains('coordinates') || 
                   element.classList.contains('promotion-choice') ||
                   element.classList.contains('coord');
          }
        }).then(canvas => {
          // Clean up - remove temporary elements
          document.body.removeChild(tempContainer);
          document.head.removeChild(styleElement);
          
          console.log("Lichess board captured successfully with enhanced method");
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
          if (document.body.contains(tempContainer)) {
            document.body.removeChild(tempContainer);
          }
          if (document.head.contains(styleElement)) {
            document.head.removeChild(styleElement);
          }
          
          console.error("html2canvas error on Lichess:", error);
          
          // Fall back to the original method if the enhanced method fails
          try {
            html2canvas(boardContainer, {
              backgroundColor: null,
              scale: 2,
              useCORS: true,
              allowTaint: true
            }).then(canvas => {
              console.log("Lichess board captured with fallback method");
              const imageData = canvas.toDataURL('image/png');
              
              resolve({
                imageData,
                pgn,
                fen,
                orientation,
                site: 'lichess'
              });
            }).catch(fallbackError => {
              console.error("Fallback capture method also failed:", fallbackError);
              reject(fallbackError);
            });
          } catch (captureError) {
            console.error("Error in fallback capture:", captureError);
            reject(captureError);
          }
        });
      } catch (error) {
        console.error("Error setting up board capture:", error);
        reject(error);
      }
    });
  }