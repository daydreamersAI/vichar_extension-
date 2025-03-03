from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import chess
import chess.pgn
import io
import requests
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key from environment variables
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_API_KEY= "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"
# Or you can use other LLM APIs as preferred
# ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

app = FastAPI(title="Chess Assistant API")

# Add CORS middleware to allow requests from browser extensions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production to be more specific
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    text: str
    sender: str

class ChessAnalysisRequest(BaseModel):
    message: str
    fen: Optional[str] = None
    pgn: Optional[str] = None
    chat_history: Optional[List[Message]] = []

class ChessAnalysisResponse(BaseModel):
    response: str

@app.get("/")
async def root():
    return {"message": "Chess Assistant API is running"}

@app.post("/analysis", response_model=ChessAnalysisResponse)
async def analyze_position(request: ChessAnalysisRequest):
    try:
        # Validate FEN if provided
        if request.fen:
            try:
                chess.Board(request.fen)
            except ValueError:
                return {"response": "Invalid FEN position format. Please check the board position."}
        
        # Parse PGN if provided
        game_analysis = ""
        if request.pgn:
            try:
                pgn = io.StringIO(request.pgn)
                chess_game = chess.pgn.read_game(pgn)
                if chess_game:
                    # Extract basic game info
                    headers = chess_game.headers
                    white = headers.get("White", "Unknown")
                    black = headers.get("Black", "Unknown")
                    result = headers.get("Result", "*")
                    
                    # Count moves
                    move_count = 0
                    board = chess.Board()
                    for move in chess_game.mainline_moves():
                        board.push(move)
                        move_count += 1
                    
                    game_analysis = f"Game: {white} vs {black}, Result: {result}, Moves: {move_count}"
            except Exception as e:
                game_analysis = f"Could not fully parse PGN: {str(e)}"
        
        # Prepare chat history for context
        chat_context = ""
        if request.chat_history:
            for message in request.chat_history:
                sender = "User" if message.sender == "user" else "Assistant"
                chat_context += f"{sender}: {message.text}\n"
        
        # Prepare the prompt for the LLM
        prompt = f"""
You are a chess analysis assistant. The user has sent the following message:
"{request.message}"

Current chess position information:
FEN: {request.fen or 'Not provided'}
{game_analysis}

Previous conversation:
{chat_context}

Provide a brief helpful analysis or response to the user's message.
"""
        
        # Call external LLM API with the prompt
        response = call_llm_api(prompt)
        
        return {"response": response}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing request: {str(e)}")

def call_llm_api(prompt: str) -> str:
    """
    Call an LLM API with the given prompt.
    This example uses OpenAI's API, but can be adapted for any LLM service.
    """
    if not OPENAI_API_KEY:
        # Fallback response if no API key
        return "I'm unable to analyze this position right now. Please check your API configuration."
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }
        
        payload = {
            "model": "gpt-4o-mini",  # or other models as appropriate
            "messages": [
                {"role": "system", "content": "You are a chess assistant that provides helpful analysis and advice for chess positions and games."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 800
        }
        
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            data=json.dumps(payload)
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            print(f"API Error: {response.status_code} - {response.text}")
            return "Sorry, I encountered an error while analyzing. Please try again."
    
    except Exception as e:
        print(f"Error calling LLM API: {str(e)}")
        return "I'm having trouble connecting to my analysis engine. Please try again later."

# Alternative implementation for Anthropic's Claude API
def call_anthropic_api(prompt: str) -> str:
    """
    Call Anthropic's Claude API instead of OpenAI.
    Uncomment and use this function if preferred.
    """
    # ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    # if not ANTHROPIC_API_KEY:
    #     return "I'm unable to analyze this position right now. Please check your API configuration."
    # 
    # try:
    #     headers = {
    #         "Content-Type": "application/json",
    #         "x-api-key": ANTHROPIC_API_KEY,
    #         "anthropic-version": "2023-06-01"
    #     }
    #     
    #     payload = {
    #         "model": "claude-3-opus-20240229",
    #         "max_tokens": 1000,
    #         "messages": [
    #             {"role": "user", "content": prompt}
    #         ]
    #     }
    #     
    #     response = requests.post(
    #         "https://api.anthropic.com/v1/messages",
    #         headers=headers,
    #         data=json.dumps(payload)
    #     )
    #     
    #     if response.status_code == 200:
    #         return response.json()["content"][0]["text"]
    #     else:
    #         print(f"API Error: {response.status_code} - {response.text}")
    #         return "Sorry, I encountered an error while analyzing. Please try again."
    # 
    # except Exception as e:
    #     print(f"Error calling Claude API: {str(e)}")
    #     return "I'm having trouble connecting to my analysis engine. Please try again later."

# Additional endpoints for chess utilities

@app.post("/validate/fen")
async def validate_fen(data: Dict[str, str]):
    """Validate a FEN string"""
    try:
        fen = data.get("fen", "")
        chess.Board(fen)  # Will raise ValueError if invalid
        return {"valid": True}
    except ValueError:
        return {"valid": False}

@app.post("/validate/pgn")
async def validate_pgn(data: Dict[str, str]):
    """Validate a PGN string"""
    try:
        pgn = data.get("pgn", "")
        pgn_io = io.StringIO(pgn)
        game = chess.pgn.read_game(pgn_io)
        if game is None:
            return {"valid": False, "error": "Could not parse PGN"}
        return {"valid": True}
    except Exception as e:
        return {"valid": False, "error": str(e)}

@app.post("/convert/fen-to-pgn")
async def fen_to_pgn(data: Dict[str, str]):
    """Convert a FEN position to a simple PGN"""
    try:
        fen = data.get("fen", "")
        board = chess.Board(fen)
        
        # Create a game from the FEN
        game = chess.pgn.Game()
        game.setup(board)
        game.headers["Result"] = "*"
        
        return {"pgn": str(game)}
    except ValueError as e:
        return {"error": f"Invalid FEN: {str(e)}"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)