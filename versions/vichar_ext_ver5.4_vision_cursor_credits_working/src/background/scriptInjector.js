// This script injects capture functionality dynamically when needed
console.log("Script injector initialized");

// Function to inject the capture script when needed
async function injectCaptureScript(tabId) {
  console.log("Injecting capture script into tab:", tabId);
  
  try {
    // First inject custom CSS to avoid font CSP violations
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: injectCustomCSS
    });
    
    console.log("Custom CSS injected successfully");
    
    // Then inject html2canvas
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

// Function to inject custom CSS with system fonts to avoid CSP violations
function injectCustomCSS() {
  console.log("Injecting custom CSS with system fonts");
  
  try {
    // Create a style element
    const style = document.createElement('style');
    style.id = 'vichar-custom-css';
    
    // Add CSS rules to use system fonts and avoid external font loading
    style.textContent = `
      /* Use system fonts to avoid CSP violations */
      #vichar-temp-board-container, 
      #vichar-temp-board-container * {
        font-family: system-ui, -apple-system, sans-serif !important;
        font-weight: normal !important;
        font-style: normal !important;
      }
      
      /* Ensure no external resources are loaded */
      #vichar-temp-board-container {
        background-image: none !important;
      }
      
      /* Hide any elements that might cause CSP issues */
      #vichar-temp-board-container .coords,
      #vichar-temp-board-container .promotion-choice,
      #vichar-temp-board-container .piece-promotion {
        display: none !important;
      }
    `;
    
    // Add the style element to the document head
    document.head.appendChild(style);
    
    console.log("Custom CSS with system fonts injected");
    return true;
  } catch (error) {
    console.error("Error injecting custom CSS:", error);
    return false;
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
      const ranks = fen.trim().split('/');
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

  // Function to extract FEN from Lichess - Enhanced version
  function extractLichessFEN() {
    console.log("Extracting FEN from Lichess using enhanced methods");
    
    // Method 0: Try to get FEN directly from the study data attribute (most reliable for studies)
    try {
      const studyChapterElem = document.querySelector('.study__chapter');
      if (studyChapterElem) {
        const dataFen = studyChapterElem.getAttribute('data-fen');
        if (dataFen && isValidFENFormat(dataFen)) {
          console.log("Found FEN in study chapter data-fen attribute:", dataFen);
          return dataFen;
        }
      }
      
      // Try to get FEN from the active node
      const activeNodeElem = document.querySelector('.node.active');
      if (activeNodeElem) {
        const dataFen = activeNodeElem.getAttribute('data-fen');
        if (dataFen && isValidFENFormat(dataFen)) {
          console.log("Found FEN in active node data-fen attribute:", dataFen);
          return dataFen;
        }
      }
      
      // Try to get FEN from the current move
      const currentMoveElem = document.querySelector('.current');
      if (currentMoveElem) {
        const dataFen = currentMoveElem.getAttribute('data-fen');
        if (dataFen && isValidFENFormat(dataFen)) {
          console.log("Found FEN in current move data-fen attribute:", dataFen);
          return dataFen;
        }
      }
    } catch (e) {
      console.log("Error getting FEN from study data attributes:", e);
    }
    
    // Method 1: Try to get FEN directly from the data-fen attribute (most reliable)
    try {
      const cgWrap = document.querySelector('.cg-wrap');
      if (cgWrap) {
        const dataFen = cgWrap.getAttribute('data-fen');
        if (dataFen && isValidFENFormat(dataFen)) {
          console.log("Found FEN in data-fen attribute:", dataFen);
          return dataFen;
        }
      }
    } catch (e) {
      console.log("Error getting FEN from data-fen attribute:", e);
    }
    
    // Method 2: Try to get FEN from Lichess's global state
    try {
      // Check for analysis node
      if (window.Lichess?.analysis?.node?.fen) {
        const fen = window.Lichess.analysis.node.fen;
        if (isValidFENFormat(fen)) {
          console.log("Found FEN in Lichess.analysis:", fen);
          return fen;
        }
      }
      
      // Check for study node
      if (window.Lichess?.study?.currentNode?.fen) {
        const fen = window.Lichess.study.currentNode.fen;
        if (isValidFENFormat(fen)) {
          console.log("Found FEN in Lichess.study:", fen);
          return fen;
        }
      }
      
      // Check for ground object
      if (window.Lichess?.chessground?.state?.fen) {
        const fen = window.Lichess.chessground.state.fen;
        if (isValidFENFormat(fen)) {
          console.log("Found FEN in Lichess.chessground:", fen);
          return fen;
        }
      }
      
      // Check for game data
      if (window.Lichess?.boot?.data?.game?.fen) {
        const fen = window.Lichess.boot.data.game.fen;
        if (isValidFENFormat(fen)) {
          console.log("Found FEN in Lichess.boot.data.game:", fen);
          return fen;
        }
      }
      
      // Check for puzzle data
      if (window.Lichess?.puzzle?.data?.puzzle?.fen) {
        const fen = window.Lichess.puzzle.data.puzzle.fen;
        if (isValidFENFormat(fen)) {
          console.log("Found FEN in Lichess.puzzle.data:", fen);
          return fen;
        }
      }
    } catch (e) {
      console.log("Error accessing Lichess global state:", e);
    }
    
    // Method 2.5: Try to get FEN from the FEN display in the UI
    try {
      // Look for FEN input field
      const fenInput = document.querySelector('input.copyable');
      if (fenInput && fenInput.value) {
        const fen = fenInput.value.trim();
        if (isValidFENFormat(fen)) {
          console.log("Found FEN in input field:", fen);
          return fen;
        }
      }
      
      // Look for FEN display in analysis
      const fenDisplay = document.querySelector('.fen');
      if (fenDisplay && fenDisplay.textContent) {
        const fen = fenDisplay.textContent.trim();
        if (isValidFENFormat(fen)) {
          console.log("Found FEN in FEN display:", fen);
          return fen;
        }
      }
      
      // Look for FEN in any element with data-fen
      const fenElements = document.querySelectorAll('[data-fen]');
      for (const el of fenElements) {
        const fen = el.getAttribute('data-fen');
        if (fen && isValidFENFormat(fen)) {
          console.log("Found FEN in element with data-fen:", fen);
          return fen;
        }
      }
    } catch (e) {
      console.log("Error getting FEN from UI elements:", e);
    }
    
    // Method 3: Try to get FEN from Lichess study data
    try {
      // Check if we're on a study page
      if (window.location.pathname.includes('/study/')) {
        console.log("Detected Lichess study page");
        
        // Try to get the study data from the page
        const studyData = document.getElementById('study-data');
        if (studyData) {
          const dataChapter = studyData.getAttribute('data-chapter');
          if (dataChapter) {
            try {
              const chapter = JSON.parse(dataChapter);
              if (chapter && chapter.fen && isValidFENFormat(chapter.fen)) {
                console.log("Found FEN in study data chapter:", chapter.fen);
                return chapter.fen;
              }
            } catch (parseError) {
              console.log("Error parsing study chapter data:", parseError);
            }
          }
        }
        
        // Try to get the current position from the move list
        const currentMove = document.querySelector('.active');
        if (currentMove) {
          const fen = currentMove.getAttribute('data-fen');
          if (fen && isValidFENFormat(fen)) {
            console.log("Found FEN in active move:", fen);
            return fen;
          }
        }
        
        // Try to get the FEN from the URL
        const studyId = window.location.pathname.split('/')[2];
        if (studyId) {
          // Check if there's a position hash in the URL
          const hash = window.location.hash;
          if (hash && hash.includes('fen=')) {
            const fenMatch = hash.match(/fen=([^&]+)/);
            if (fenMatch && fenMatch[1]) {
              const fen = decodeURIComponent(fenMatch[1]);
              if (isValidFENFormat(fen)) {
                console.log("Found FEN in URL hash:", fen);
                return fen;
              }
            }
          }
        }
        
        // Try to get FEN from the analysis board
        const analysisBoard = document.querySelector('.analyse__board');
        if (analysisBoard) {
          // Try to get the FEN from the data-fen attribute
          const dataFen = analysisBoard.getAttribute('data-fen');
          if (dataFen && isValidFENFormat(dataFen)) {
            console.log("Found FEN in analysis board data-fen:", dataFen);
            return dataFen;
          }
          
          // Try to get the FEN from the board state
          const cgBoard = analysisBoard.querySelector('cg-board');
          if (cgBoard) {
            // Try to get the FEN from the board state by looking at the pieces
            const pieces = cgBoard.querySelectorAll('piece');
            if (pieces.length > 0) {
              console.log(`Found ${pieces.length} pieces on the analysis board`);
              
              // Initialize 8x8 board array
              const boardArray = Array(8).fill().map(() => Array(8).fill(''));
              
              // Check board orientation
              const isFlipped = analysisBoard.classList.contains('orientation-black');
              
              // Get board dimensions
              const boardRect = cgBoard.getBoundingClientRect();
              const squareSize = boardRect.width / 8;
              
              // Process each piece
              pieces.forEach(piece => {
                // Get piece color and type from class names
                const pieceClasses = piece.className.split(' ');
                let color = '';
                let type = '';
                
                // Determine piece color
                if (pieceClasses.includes('white')) color = 'w';
                else if (pieceClasses.includes('black')) color = 'b';
                else return; // Skip if no color found
                
                // Determine piece type
                if (pieceClasses.includes('king')) type = 'k';
                else if (pieceClasses.includes('queen')) type = 'q';
                else if (pieceClasses.includes('rook')) type = 'r';
                else if (pieceClasses.includes('bishop')) type = 'b';
                else if (pieceClasses.includes('knight')) type = 'n';
                else if (pieceClasses.includes('pawn')) type = 'p';
                else return; // Skip if no type found
                
                // Get position from transform style
                const transform = piece.style.transform || '';
                let file = -1;
                let rank = -1;
                
                // Handle both translate and translate3d formats
                const translate3dMatch = transform.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
                const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^,]+)px/);
                
                if (translate3dMatch) {
                  const x = parseFloat(translate3dMatch[1]);
                  const y = parseFloat(translate3dMatch[2]);
                  
                  // Calculate file and rank based on the percentage of the board width/height
                  file = Math.floor(x / squareSize);
                  rank = Math.floor(y / squareSize);
                } else if (translateMatch) {
                  const x = parseFloat(translateMatch[1]);
                  const y = parseFloat(translateMatch[2]);
                  
                  // Calculate file and rank based on the percentage of the board width/height
                  file = Math.floor(x / squareSize);
                  rank = Math.floor(y / squareSize);
                } else {
                  return; // Skip if no transform found
                }
                
                // Adjust for board orientation
                if (isFlipped) {
                  file = 7 - file;
                  rank = 7 - rank;
                }
                
                // Validate coordinates
                if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
                  // Place piece on board
                  boardArray[rank][file] = color === 'w' ? type.toUpperCase() : type;
                }
              });
              
              // Convert board array to FEN string
              let fen = '';
              for (let rank = 0; rank < 8; rank++) {
                let emptyCount = 0;
                for (let file = 0; file < 8; file++) {
                  const piece = boardArray[rank][file];
                  if (piece === '') {
                    emptyCount++;
                  } else {
                    if (emptyCount > 0) {
                      fen += emptyCount;
                      emptyCount = 0;
                    }
                    fen += piece;
                  }
                }
                if (emptyCount > 0) {
                  fen += emptyCount;
                }
                if (rank < 7) fen += '/';
              }
              
              // Complete FEN string
              fen += ' w KQkq - 0 1';
              
              if (isValidFENFormat(fen) && fen !== '8/8/8/8/8/8/8/8 w KQkq - 0 1') {
                console.log("Generated FEN from analysis board:", fen);
                return fen;
              }
            }
          }
        }
      }
    } catch (e) {
      console.log("Error extracting FEN from study data:", e);
    }

    // Method 4: Try to get FEN from embedded JSON data
    try {
      // Look for JSON data in script tags
      const scriptTags = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scriptTags) {
        try {
          const jsonData = JSON.parse(script.textContent);
          if (jsonData && jsonData.fen && isValidFENFormat(jsonData.fen)) {
            console.log("Found FEN in embedded JSON data:", jsonData.fen);
            return jsonData.fen;
          }
          
          // Check for nested FEN
          if (jsonData && jsonData.mainEntity && jsonData.mainEntity.fen && isValidFENFormat(jsonData.mainEntity.fen)) {
            console.log("Found FEN in embedded JSON mainEntity:", jsonData.mainEntity.fen);
            return jsonData.mainEntity.fen;
          }
        } catch (parseError) {
          // Ignore JSON parse errors
        }
      }
    } catch (e) {
      console.log("Error extracting FEN from embedded JSON:", e);
    }
    
    // Method 5: Try to extract FEN by reading the board squares directly
    try {
      const board = document.querySelector('cg-board');
      if (board) {
        // Check board orientation
        const cgWrap = document.querySelector('.cg-wrap');
        const isFlipped = cgWrap && cgWrap.classList.contains('orientation-black');
        console.log("Board orientation:", isFlipped ? "black" : "white");
        
        // Initialize 8x8 board array
        const boardArray = Array(8).fill().map(() => Array(8).fill(''));
        
        // Get all squares with pieces
        const squares = board.querySelectorAll('square');
        if (squares && squares.length > 0) {
          console.log(`Found ${squares.length} squares with pieces`);
          
          // Process each square
          squares.forEach(square => {
            // Get square coordinates
            const key = square.getAttribute('key');
            if (key && key.length === 2) {
              const file = key.charCodeAt(0) - 'a'.charCodeAt(0);
              const rank = 8 - parseInt(key.charAt(1));
              
              // Get piece info
              const pieceElement = square.querySelector('piece');
              if (pieceElement) {
                const pieceClasses = pieceElement.className.split(' ');
                let color = '';
                let type = '';
                
                // Determine piece color
                if (pieceClasses.includes('white')) color = 'w';
                else if (pieceClasses.includes('black')) color = 'b';
                else return; // Skip if no color found
                
                // Determine piece type
                if (pieceClasses.includes('king')) type = 'k';
                else if (pieceClasses.includes('queen')) type = 'q';
                else if (pieceClasses.includes('rook')) type = 'r';
                else if (pieceClasses.includes('bishop')) type = 'b';
                else if (pieceClasses.includes('knight')) type = 'n';
                else if (pieceClasses.includes('pawn')) type = 'p';
                else return; // Skip if no type found
                
                // Place piece on board
                if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
                  boardArray[rank][file] = color === 'w' ? type.toUpperCase() : type;
                  console.log(`Placed ${color}${type} at square ${key} (rank ${rank}, file ${file})`);
                }
              }
            }
          });
          
          // Count pieces to ensure we have a valid position
          let pieceCount = 0;
          for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
              if (boardArray[rank][file] !== '') {
                pieceCount++;
              }
            }
          }
          
          // Only proceed if we have at least some pieces
          if (pieceCount > 0) {
            // Convert board array to FEN string
            let fen = '';
            for (let rank = 0; rank < 8; rank++) {
              let emptyCount = 0;
              for (let file = 0; file < 8; file++) {
                const piece = boardArray[rank][file];
                if (piece === '') {
                  emptyCount++;
                } else {
                  if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                  }
                  fen += piece;
                }
              }
              if (emptyCount > 0) {
                fen += emptyCount;
              }
              if (rank < 7) fen += '/';
            }
            
            // Check if the FEN is valid (not empty board)
            if (fen === '8/8/8/8/8/8/8/8') {
              console.log("Generated an empty board FEN from squares, trying alternative methods");
            } else {
              // Determine turn
              let turnColor = 'w'; // Default to white's turn
              
              // Try to determine turn from the DOM
              const turnIndicator = document.querySelector('.move-status');
              if (turnIndicator) {
                const turnText = turnIndicator.textContent.toLowerCase();
                if (turnText.includes('black') || turnText.includes('dark')) {
                  turnColor = 'b';
                }
              }
              
              // Complete FEN string
              fen += ` ${turnColor} KQkq - 0 1`;
              
              console.log("Generated FEN from board squares:", fen);
              return fen;
            }
          }
        }
      }
    } catch (e) {
      console.log("Error extracting FEN from board squares:", e);
    }
    
    // Method 6: Try to extract FEN from the board state using piece transforms
    try {
      const board = document.querySelector('cg-board');
      if (board) {
        const pieces = board.querySelectorAll('piece');
        console.log("Found", pieces.length, "pieces on the board");
        
        if (pieces.length > 0) {
          // Initialize 8x8 board array
          const boardArray = Array(8).fill().map(() => Array(8).fill(''));
          
          // Check board orientation
          const cgWrap = document.querySelector('.cg-wrap');
          const isFlipped = cgWrap && cgWrap.classList.contains('orientation-black');
          console.log("Board orientation:", isFlipped ? "black" : "white");
          
          // Get board dimensions
          const boardRect = board.getBoundingClientRect();
          const squareSize = boardRect.width / 8;
          
          // Track pieces for debugging
          const piecePositions = [];
          
          // Process each piece
          pieces.forEach(piece => {
            // Get piece color and type from class names
            const pieceClasses = piece.className.split(' ');
            let color = '';
            let type = '';
            
            // Determine piece color
            if (pieceClasses.includes('white')) color = 'w';
            else if (pieceClasses.includes('black')) color = 'b';
            else return; // Skip if no color found
            
            // Determine piece type
            if (pieceClasses.includes('king')) type = 'k';
            else if (pieceClasses.includes('queen')) type = 'q';
            else if (pieceClasses.includes('rook')) type = 'r';
            else if (pieceClasses.includes('bishop')) type = 'b';
            else if (pieceClasses.includes('knight')) type = 'n';
            else if (pieceClasses.includes('pawn')) type = 'p';
            else return; // Skip if no type found
            
            // Get position from transform style
            const transform = piece.style.transform || '';
            let file = -1;
            let rank = -1;
            
            // Handle both translate and translate3d formats
            const translate3dMatch = transform.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
            const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^,]+)px/);
            
            if (translate3dMatch) {
              const x = parseFloat(translate3dMatch[1]);
              const y = parseFloat(translate3dMatch[2]);
              
              // Calculate file and rank based on the percentage of the board width/height
              file = Math.floor(x / squareSize);
              rank = Math.floor(y / squareSize);
            } else if (translateMatch) {
              const x = parseFloat(translateMatch[1]);
              const y = parseFloat(translateMatch[2]);
              
              // Calculate file and rank based on the percentage of the board width/height
              file = Math.floor(x / squareSize);
              rank = Math.floor(y / squareSize);
            } else {
              return; // Skip if no transform found
            }
            
            // Adjust for board orientation
            if (isFlipped) {
              file = 7 - file;
              rank = 7 - rank;
            }
            
            // Store piece position for debugging
            piecePositions.push({
              piece: color + type,
              file,
              rank,
              transform
            });
            
            // Validate coordinates
            if (file >= 0 && file < 8 && rank >= 0 && rank < 8) {
              // Only place the piece if the square is empty
              if (boardArray[rank][file] === '') {
                boardArray[rank][file] = color === 'w' ? type.toUpperCase() : type;
                console.log(`Placed ${color}${type} at rank ${rank}, file ${file}`);
              } else {
                console.log(`Square at rank ${rank}, file ${file} already occupied by ${boardArray[rank][file]}, trying to place ${color}${type}`);
              }
            }
          });
          
          // Log piece positions for debugging
          console.log("Piece positions:", JSON.stringify(piecePositions));
          
          // Count pieces to ensure we have a valid position
          let pieceCount = 0;
          for (let rank = 0; rank < 8; rank++) {
            for (let file = 0; file < 8; file++) {
              if (boardArray[rank][file] !== '') {
                pieceCount++;
              }
            }
          }
          
          // Only proceed if we have at least some pieces
          if (pieceCount > 0) {
            // Convert board array to FEN string
            let fen = '';
            for (let rank = 0; rank < 8; rank++) {
              let emptyCount = 0;
              for (let file = 0; file < 8; file++) {
                const piece = boardArray[rank][file];
                if (piece === '') {
                  emptyCount++;
                } else {
                  if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                  }
                  fen += piece;
                }
              }
              if (emptyCount > 0) {
                fen += emptyCount;
              }
              if (rank < 7) fen += '/';
            }
            
            // Check if the FEN is valid (not empty board)
            if (fen === '8/8/8/8/8/8/8/8') {
              console.log("Generated an empty board FEN, trying alternative methods");
            } else {
              // Determine turn
              let turnColor = 'w'; // Default to white's turn
              
              // Try to determine turn from the DOM
              const turnIndicator = document.querySelector('.move-status');
              if (turnIndicator) {
                const turnText = turnIndicator.textContent.toLowerCase();
                if (turnText.includes('black') || turnText.includes('dark')) {
                  turnColor = 'b';
                }
              }
              
              // Complete FEN string
              fen += ` ${turnColor} KQkq - 0 1`;
              
              console.log("Generated FEN from visible pieces:", fen);
              return fen;
            }
          } else {
            console.log("No valid pieces found on the board");
          }
        }
      }
    } catch (e) {
      console.log("Error generating FEN from board state:", e);
    }
    
    // Method 7: Try to get FEN from URL
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const fen = urlParams.get('fen');
      if (fen && isValidFENFormat(fen)) {
        console.log("Found FEN in URL:", fen);
        return fen;
      }
    } catch (e) {
      console.log("Error getting FEN from URL:", e);
    }
    
    // Method 8: Try to get FEN from the DOM
    try {
      // Look for any element with a data-fen attribute
      const fenElements = document.querySelectorAll('[data-fen]');
      for (const el of fenElements) {
        const fen = el.getAttribute('data-fen');
        if (fen && isValidFENFormat(fen)) {
          console.log("Found FEN in element with data-fen attribute:", fen);
          return fen;
        }
      }
      
      // Look for FEN in the page content
      const fenRegex = /\b([rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+\/[rnbqkpRNBQKP1-8]+)\s+([wb])\s+((?:K?Q?k?q?|-)+)\s+((?:[a-h][36]|-)+)\s+(\d+)\s+(\d+)\b/;
      const bodyText = document.body.textContent;
      const fenMatch = bodyText.match(fenRegex);
      if (fenMatch && fenMatch[0] && isValidFENFormat(fenMatch[0])) {
        console.log("Found FEN in page content:", fenMatch[0]);
        return fenMatch[0];
      }
    } catch (e) {
      console.log("Error searching for FEN in DOM:", e);
    }

    console.log("Could not extract valid FEN, using default position");
    return "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  }

  // Function to capture board on Lichess with enhanced quality
  async function captureLichessBoard(pgn) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("Starting Lichess board capture");
        
        // Try multiple selectors to find the board container
        let boardContainer = document.querySelector('.main-board') || 
                            document.querySelector('.cg-wrap') || 
                            document.querySelector('.round__app__board') ||
                            document.querySelector('.analyse__board');
        
        if (!boardContainer) {
          throw new Error("Could not find board container");
        }
        
        console.log("Found board container:", boardContainer);
        
        // Extract FEN position
        const fen = extractLichessFEN();
        console.log("Extracted FEN:", fen);
        
        // Determine board orientation
        const isFlipped = boardContainer.classList.contains('orientation-black');
        console.log("Board orientation:", isFlipped ? "black" : "white");
        
        // Create a temporary container for capturing
        const tempContainer = document.createElement('div');
        tempContainer.id = 'vichar-temp-board-container';
        tempContainer.style.cssText = `
          position: fixed;
          top: -9999px;
          left: -9999px;
          width: 600px;
          height: 600px;
          z-index: -1;
          background: transparent;
          overflow: hidden;
        `;
        document.body.appendChild(tempContainer);
        
        // Create a fresh board instead of cloning
        const freshBoard = document.createElement('div');
        freshBoard.className = 'fresh-board';
        freshBoard.style.cssText = `
          width: 600px !important;
          height: 600px !important;
          position: relative !important;
          overflow: visible !important;
          background-color: #d9d9d9 !important;
          font-family: system-ui, -apple-system, sans-serif !important;
        `;
        
        // Create the board background
        const boardBackground = document.createElement('div');
        boardBackground.className = 'board-background';
        boardBackground.style.cssText = `
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiPjxkZWZzPjxwYXR0ZXJuIGlkPSJjaGVja2VyIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIiB3aWR0aD0iMjUlIiBoZWlnaHQ9IjI1JSI+PHJlY3QgZmlsbD0iI2Q5ZDlkOSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjxyZWN0IGZpbGw9IiNiYmJiYmIiIHdpZHRoPSIxMi41JSIgaGVpZ2h0PSIxMi41JSIvPjxyZWN0IGZpbGw9IiNiYmJiYmIiIHdpZHRoPSIxMi41JSIgaGVpZ2h0PSIxMi41JSIgeD0iMTIuNSUiIHk9IjEyLjUlIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2NoZWNrZXIpIi8+PC9zdmc+') !important;
          background-size: 100% 100% !important;
        `;
        freshBoard.appendChild(boardBackground);
        
        // Add the fresh board to the temporary container
        tempContainer.appendChild(freshBoard);
        
        // Parse the FEN to place pieces
        if (fen && fen !== "8/8/8/8/8/8/8/8") {
          try {
            const fenParts = fen.split(' ');
            const position = fenParts[0];
            const rows = position.split('/');
            
            // Process each row of the FEN
            rows.forEach((row, rankIndex) => {
              let fileIndex = 0;
              
              // Process each character in the row
              for (let i = 0; i < row.length; i++) {
                const char = row[i];
                
                // If it's a number, skip that many squares
                if (!isNaN(parseInt(char))) {
                  fileIndex += parseInt(char);
                } else {
                  // It's a piece
                  const isWhite = char === char.toUpperCase();
                  const pieceType = char.toLowerCase();
                  
                  // Create a piece element
                  const piece = document.createElement('div');
                  piece.className = 'piece';
                  
                  // Calculate position based on file and rank
                  let file = fileIndex;
                  let rank = rankIndex;
                  
                  // Adjust for board orientation
                  if (isFlipped) {
                    file = 7 - file;
                    rank = 7 - rank;
                  }
                  
                  // Set piece style
                  piece.style.cssText = `
                    position: absolute !important;
                    width: 12.5% !important;
                    height: 12.5% !important;
                    top: ${rank * 12.5}% !important;
                    left: ${file * 12.5}% !important;
                    background-size: contain !important;
                    background-position: center !important;
                    background-repeat: no-repeat !important;
                    z-index: 2 !important;
                  `;
                  
                  // Map piece type to SVG
                  const color = isWhite ? 'w' : 'b';
                  let type = '';
                  
                  switch (pieceType) {
                    case 'k': type = 'k'; break;
                    case 'q': type = 'q'; break;
                    case 'r': type = 'r'; break;
                    case 'b': type = 'b'; break;
                    case 'n': type = 'n'; break;
                    case 'p': type = 'p'; break;
                  }
                  
                  // Use SVG data URLs for pieces
                  if (color && type) {
                    const pieceKey = `${color}${type}`;
                    const svgData = getPieceSvgData(pieceKey);
                    if (svgData) {
                      piece.style.backgroundImage = `url('data:image/svg+xml;base64,${btoa(svgData)}')`;
                    }
                  }
                  
                  // Add the piece to the board
                  freshBoard.appendChild(piece);
                  
                  // Move to the next file
                  fileIndex++;
                }
              }
            });
            
            console.log("Placed pieces on the board based on FEN");
          } catch (fenError) {
            console.error("Error placing pieces from FEN:", fenError);
            
            // Fallback to direct board capture if FEN parsing fails
            try {
              // Clone the board for direct capture
              const boardClone = boardContainer.cloneNode(true);
              
              // Remove any unnecessary elements
              const elementsToRemove = boardClone.querySelectorAll('.coords, .promotion-choice, .piece-promotion');
              elementsToRemove.forEach(el => el.remove());
              
              // Set fixed dimensions for the clone
              boardClone.style.cssText = `
                width: 600px !important;
                height: 600px !important;
                position: relative !important;
                overflow: visible !important;
                transform: none !important;
                background-color: #d9d9d9 !important;
                font-family: system-ui, -apple-system, sans-serif !important;
              `;
              
              // Add the clone to the temporary container
              tempContainer.innerHTML = '';
              tempContainer.appendChild(boardClone);
              
              console.log("Using direct board clone as fallback");
            } catch (cloneError) {
              console.error("Error with direct board clone:", cloneError);
            }
          }
        } else {
          // If no valid FEN, try to copy pieces from the original board
          const originalPieces = boardContainer.querySelectorAll('piece');
          console.log(`Found ${originalPieces.length} pieces on the original board`);
          
          if (originalPieces.length > 0) {
            originalPieces.forEach(originalPiece => {
              // Get piece color and type from class names
              const pieceClasses = originalPiece.className.split(' ');
              let color = '';
              let type = '';
              
              // Determine piece color
              if (pieceClasses.includes('white')) color = 'w';
              else if (pieceClasses.includes('black')) color = 'b';
              else return; // Skip if no color found
              
              // Determine piece type
              if (pieceClasses.includes('king')) type = 'k';
              else if (pieceClasses.includes('queen')) type = 'q';
              else if (pieceClasses.includes('rook')) type = 'r';
              else if (pieceClasses.includes('bishop')) type = 'b';
              else if (pieceClasses.includes('knight')) type = 'n';
              else if (pieceClasses.includes('pawn')) type = 'p';
              else return; // Skip if no type found
              
              // Get position from transform style
              const transform = originalPiece.style.transform || '';
              const boardRect = boardContainer.getBoundingClientRect();
              const squareSize = boardRect.width / 8;
              
              // Handle both translate and translate3d formats
              const translate3dMatch = transform.match(/translate3d\(([^,]+)px,\s*([^,]+)px/);
              const translateMatch = transform.match(/translate\(([^,]+)px,\s*([^,]+)px/);
              
              let x = 0, y = 0;
              
              if (translate3dMatch) {
                x = parseFloat(translate3dMatch[1]);
                y = parseFloat(translate3dMatch[2]);
              } else if (translateMatch) {
                x = parseFloat(translateMatch[1]);
                y = parseFloat(translateMatch[2]);
              } else {
                return; // Skip if no transform found
              }
              
              // Calculate file and rank based on the percentage of the board width/height
              let file = Math.floor(x / squareSize);
              let rank = Math.floor(y / squareSize);
              
              // Create a piece element
              const piece = document.createElement('div');
              piece.className = 'piece';
              
              // Set piece style
              piece.style.cssText = `
                position: absolute !important;
                width: 12.5% !important;
                height: 12.5% !important;
                top: ${rank * 12.5}% !important;
                left: ${file * 12.5}% !important;
                background-size: contain !important;
                background-position: center !important;
                background-repeat: no-repeat !important;
                z-index: 2 !important;
              `;
              
              // Use SVG data URLs for pieces
              if (color && type) {
                const pieceKey = `${color}${type}`;
                const svgData = getPieceSvgData(pieceKey);
                if (svgData) {
                  piece.style.backgroundImage = `url('data:image/svg+xml;base64,${btoa(svgData)}')`;
                }
              }
              
              // Add the piece to the board
              freshBoard.appendChild(piece);
            });
            
            console.log("Copied pieces from the original board");
          } else {
            // Last resort: try direct board capture
            try {
              // Clone the board for direct capture
              const boardClone = boardContainer.cloneNode(true);
              
              // Remove any unnecessary elements
              const elementsToRemove = boardClone.querySelectorAll('.coords, .promotion-choice, .piece-promotion');
              elementsToRemove.forEach(el => el.remove());
              
              // Set fixed dimensions for the clone
              boardClone.style.cssText = `
                width: 600px !important;
                height: 600px !important;
                position: relative !important;
                overflow: visible !important;
                transform: none !important;
                background-color: #d9d9d9 !important;
                font-family: system-ui, -apple-system, sans-serif !important;
              `;
              
              // Add the clone to the temporary container
              tempContainer.innerHTML = '';
              tempContainer.appendChild(boardClone);
              
              console.log("Using direct board clone as last resort");
            } catch (cloneError) {
              console.error("Error with direct board clone:", cloneError);
            }
          }
        }
        
        // Wait a bit for everything to render properly
        setTimeout(async () => {
          try {
            // Use html2canvas to capture the board
            const canvas = await html2canvas(tempContainer.firstChild, {
              backgroundColor: null,
              scale: 1,
              logging: true,
              useCORS: true,
              allowTaint: true,
              width: 600,
              height: 600,
              onclone: (clonedDoc) => {
                console.log("Document cloned for capture");
              }
            });
            
            // Convert canvas to image data
            const imageData = canvas.toDataURL('image/png');
            
            // Clean up
            if (tempContainer && tempContainer.parentNode) {
              tempContainer.parentNode.removeChild(tempContainer);
            }
            
            console.log("Board capture completed successfully");
            resolve({ imageData, fen, orientation: isFlipped ? 'black' : 'white' });
          } catch (error) {
            console.error("Error during html2canvas capture:", error);
            reject(error);
          }
        }, 500);
      } catch (error) {
        console.error("Error in captureLichessBoard:", error);
        reject(error);
      }
    });
  }

  // Helper function to get SVG data for chess pieces
  function getPieceSvgData(pieceKey) {
    // Simple SVG representations of chess pieces
    const pieceSvgs = {
      'wk': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6M20 8h5" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#fff" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0"/></g></svg>',
      'wq': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 12a2 2 0 1 1 4 0 2 2 0 1 1-4 0zM24.5 7.5a2 2 0 1 1 4 0 2 2 0 1 1-4 0zM41 12a2 2 0 1 1 4 0 2 2 0 1 1-4 0zM16 8.5a2 2 0 1 1 4 0 2 2 0 1 1-4 0zM33 9a2 2 0 1 1 4 0 2 2 0 1 1-4 0z"/><path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-3-15-3 15-5.5-14V25L7 14l2 12z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none"/></g></svg>',
      'wr': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" stroke-linecap="butt"/><path d="M34 14l-3 3H14l-3-3"/><path d="M31 17v12.5H14V17" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M31 29.5l1.5 2.5h-20l1.5-2.5"/><path d="M11 14h23" fill="none" stroke-linejoin="miter"/></g></svg>',
      'wb': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="#fff" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#fff" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/></g></svg>',
      'wn': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#fff"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#fff"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zM14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#000" stroke="#000"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z" fill="#000" stroke="none"/></g></svg>',
      'wp': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>',
      'bk': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22.5 11.63V6" stroke-linejoin="miter"/><path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" fill="#000" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" fill="#000"/><path d="M20 8h5" stroke-linejoin="miter"/><path d="M32 29.5s8.5-4 6.03-9.65C34.15 14 25 18 22.5 24.5l.01 2.1-.01-2.1C20 18 9.906 14 6.997 19.85c-2.497 5.65 4.853 9 4.853 9" stroke="#fff"/><path d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0" stroke="#fff"/></g></svg>',
      'bq': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g stroke="none"><circle cx="6" cy="12" r="2.75"/><circle cx="14" cy="9" r="2.75"/><circle cx="22.5" cy="8" r="2.75"/><circle cx="31" cy="9" r="2.75"/><circle cx="39" cy="12" r="2.75"/></g><path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" stroke-linecap="butt"/><path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" stroke-linecap="butt"/><path d="M11 38.5a35 35 1 0 0 23 0" fill="none" stroke-linecap="butt"/><path d="M11 29a35 35 1 0 1 23 0m-21.5 2.5h20m-21 3a35 35 1 0 0 22 0m-23 3a35 35 1 0 0 24 0" fill="none" stroke="#fff"/></g></svg>',
      'br': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 39h27v-3H9v3zM12.5 32l1.5-2.5h17l1.5 2.5h-20zM12 36v-4h21v4H12z" stroke-linecap="butt"/><path d="M14 29.5v-13h17v13H14z" stroke-linecap="butt" stroke-linejoin="miter"/><path d="M14 16.5L11 14h23l-3 2.5H14zM11 14V9h4v2h5V9h5v2h5V9h4v5H11z" stroke-linecap="butt"/><path d="M12 35.5h21m-20-4h19m-18-2h17m-17-13h17M11 14h23" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/></g></svg>',
      'bb': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g fill="#000" stroke-linecap="butt"><path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z"/><path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z"/><path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0z"/></g><path d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5" stroke="#fff" stroke-linejoin="miter"/></g></svg>',
      'bn': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><g fill="none" fill-rule="evenodd" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill="#000"/><path d="M24 18c.38 2.91-5.55 7.37-8 9-3 2-2.82 4.34-5 4-1.042-.94 1.41-3.04 0-3-1 0 .19 1.23-1 2-1 0-4.003 1-4-4 0-2 6-12 6-12s1.89-1.9 2-3.5c-.73-.994-.5-2-.5-3 1-1 3 2.5 3 2.5h2s.78-1.992 2.5-3c1 0 1 3 1 3" fill="#000"/><path d="M9.5 25.5a.5.5 0 1 1-1 0 .5.5 0 1 1 1 0zM14.933 15.75a.5 1.5 30 1 1-.866-.5.5 1.5 30 1 1 .866.5z" fill="#fff" stroke="#fff"/><path d="M24.55 10.4l-.45 1.45.5.15c3.15 1 5.65 2.49 7.9 6.75S35.75 29.06 35.25 39l-.05.5h2.25l.05-.5c.5-10.06-.88-16.85-3.25-21.34-2.37-4.49-5.79-6.64-9.19-7.16l-.51-.1z" fill="#fff" stroke="none"/></g></svg>',
      'bp': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill="#000" stroke="#000" stroke-width="1.5" stroke-linecap="round"/></svg>'
    };
    
    return pieceSvgs[pieceKey] || null;
  }
}

// Export the function for use in other modules
export { injectCaptureScript };