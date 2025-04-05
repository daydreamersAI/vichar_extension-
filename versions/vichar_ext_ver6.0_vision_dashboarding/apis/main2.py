from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from typing import List, Dict, Optional, Any
import chess
import chess.pgn
import io
import requests # Using requests for OpenAI consistency, consider httpx for async
import json
import os
import base64
from dotenv import load_dotenv
from pymongo import MongoClient
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta, timezone # Added timezone
import razorpay
import hmac
import hashlib
import traceback # For detailed error logging

# --- LLM Client Imports ---
import anthropic
import google.generativeai as genai
# Note: OpenAI client not strictly needed if using requests/httpx

# Load environment variables
load_dotenv()

# --- API Keys ---
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# MongoDB connection string
MONGODB_URI = os.getenv("MONGODB_URL", "mongodb+srv://user1:cartoon1@mongo-practice.slkil.mongodb.net/chess_assistant_db?retryWrites=true&w=majority&appName=Mongo-practice")

# JWT Secret
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key-please-change") # CHANGE THIS IN PRODUCTION
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_MINUTES = 60 * 24 * 7 # 7 days token validity

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Chess Assistant API")

# --- Initialize API Clients ---
openai_client_available = bool(OPENAI_API_KEY)
if openai_client_available:
    print("OpenAI API Key found.")
else:
    print("Warning: OpenAI API Key not found.")

anthropic_client = None
if ANTHROPIC_API_KEY:
    try:
        # Use Async client for compatibility with FastAPI's async nature
        anthropic_client = anthropic.AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
        print("Anthropic client initialized (Async).")
    except Exception as e:
        print(f"Failed to initialize Anthropic client: {e}")
else:
    print("Warning: Anthropic API Key not found.")

google_client_available = False
if GOOGLE_API_KEY:
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        google_client_available = True
        print("Google Generative AI configured.")
    except Exception as e:
        print(f"Failed to configure Google Generative AI: {e}")
else:
    print("Warning: Google API Key not found.")
# --- END Initialize API Clients ---


# OAuth2 password bearer token
# auto_error=False means it won't automatically raise an error if token is missing,
# allowing endpoints to handle optional authentication.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

# Note: CORS handling is managed by Nginx, so we don't need FastAPI's CORS middleware

# MongoDB connection
try:
    # Added connectTimeoutMS and socketTimeoutMS for robustness
    client = MongoClient(
        MONGODB_URI,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=10000 # Longer socket timeout for operations
    )
    client.admin.command('ping') # Verify connection
    print("MongoDB connection successful!")
    db = client.get_database() # Get DB name from URI or default
    if db is None:
        # Fallback or explicit DB name if not in URI
        db = client["chess_assistant_db"]
    print(f"Using database: {db.name}")
    users_collection = db["users"]
    subscriptions_collection = db["subscriptions"]
    credits_collection = db["credits"]

    # Create indexes only if they don't exist
    existing_user_indexes = users_collection.index_information()
    if "email_1" not in existing_user_indexes:
        users_collection.create_index("email", unique=True)
        print("Created 'email' index on users")

    existing_sub_indexes = subscriptions_collection.index_information()
    if "user_id_1" not in existing_sub_indexes:
        subscriptions_collection.create_index("user_id", unique=True)
        print("Created 'user_id' index on subscriptions")

    if 'credits' not in db.list_collection_names():
        db.create_collection("credits")
        print("Created 'credits' collection")

    existing_credit_indexes = credits_collection.index_information()
    if "user_id_1" not in existing_credit_indexes:
         credits_collection.create_index("user_id")
         print("Created 'user_id' index on credits")
    if "type_1_user_id_1" not in existing_credit_indexes:
         # Index for efficiently finding balance or usage/pending orders per user
         credits_collection.create_index([("type", 1), ("user_id", 1)])
         print("Created 'type_user_id' index on credits")

    MONGODB_ENABLED = True
except Exception as e:
    print(f"FATAL: MongoDB connection or setup failed: {e}")
    MONGODB_ENABLED = False
    # Fallback in-memory stores (Not suitable for production)
    fallback_users = {}
    fallback_subscriptions = {}
    fallback_credits = {} # Stores balance per user_id

# --- Pydantic Models ---
class Message(BaseModel):
    text: str
    sender: str # "user" or "assistant"

class ChessAnalysisRequest(BaseModel):
    message: str
    fen: Optional[str] = None
    pgn: Optional[str] = None
    image_data: Optional[str] = None  # Base64 encoded image data (string)
    chat_history: Optional[List[Message]] = []
    model: Optional[str] = None # Model ID from frontend (e.g., "gpt-4o-mini")
    computer_evaluation: Optional[str] = None
    computer_variation: Optional[str] = None

class ChessAnalysisResponse(BaseModel):
    response: str
    credits: Optional[Dict[str, int]] = None # e.g., {"used": 1, "remaining": 99}

# --- Other Models ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: str # Keep user_id for frontend reference
    name: str

class SubscriptionOrderCreate(BaseModel):
    plan: str # e.g., "premium"
    interval: str # e.g., "monthly", "yearly"

class CreditPurchaseCreate(BaseModel):
    # Use 'package' to match frontend data-package-id attribute convention
    package: str # e.g., "basic", "standard", "premium"

class PaymentVerification(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

# --- Constants ---
MODEL_GPT4_O_MINI = "gpt-4o-mini"
MODEL_GPT4_O = "gpt-4o"
MODEL_CLAUDE_3_5_SONNET = "claude-3-5-sonnet-20240620"
MODEL_GEMINI_1_5_FLASH = "gemini-1.5-flash-latest"

# Default model if selection is invalid or missing
DEFAULT_MODEL = MODEL_GPT4_O_MINI

# Mapping frontend model IDs (if different) to backend constants
# Ensures consistency and allows flexibility in naming
MODEL_MAP = {
    "gpt-4o-mini": MODEL_GPT4_O_MINI,
    "gpt-4o": MODEL_GPT4_O,
    "claude-3-5-sonnet-20240620": MODEL_CLAUDE_3_5_SONNET,
    "gemini-1.5-flash-latest": MODEL_GEMINI_1_5_FLASH,
    # Add aliases if needed, e.g., if frontend sends "gemini-flash"
    "gemini-flash": MODEL_GEMINI_1_5_FLASH,
    "claude-sonnet": MODEL_CLAUDE_3_5_SONNET,
}

# --- Helper functions (Authentication, etc.) ---
# ... (keep verify_password, get_password_hash, create_access_token as they were) ...
def verify_password(plain_password, hashed_password):
    try:
        # Check if the stored password looks like a bcrypt hash
        if hashed_password and hashed_password.startswith("$2b$"):
            return pwd_context.verify(plain_password, hashed_password)
        else:
            # Assume plain text comparison if not a hash
            return plain_password == hashed_password
    except Exception as e:
        print(f"Password verification error: {e}")
        # Fallback to plain text comparison on error
        return plain_password == hashed_password

def get_password_hash(password):
    try:
        return pwd_context.hash(password)
    except Exception as e:
        print(f"Password hashing error: {e}")
        # In case of error, return the plain password (not secure, but temporary)
        return password

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=JWT_EXPIRATION_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

# --- Root Endpoint ---
@app.get("/")
async def root():
    return {"message": "Chess Assistant API is running", "mongodb_enabled": MONGODB_ENABLED}

# Also handle HEAD requests
@app.head("/")
async def root_head():
    return {"message": "Chess Assistant API is running", "mongodb_enabled": MONGODB_ENABLED}

# Test user creation endpoint for when MongoDB is down
@app.post("/create-test-user")
async def create_test_user():
    if MONGODB_ENABLED:
        return {"message": "MongoDB is working, please use the regular /register endpoint"}
    
    # Create a test user in the fallback system
    test_email = "test@example.com"
    test_password = "testpassword"
    test_name = "Test User"
    
    if test_email in fallback_users:
        return {"message": "Test user already exists", "email": test_email, "password": test_password}
    
    user_id = f"user_{len(fallback_users) + 1}"
    fallback_users[test_email] = {"id": user_id, "email": test_email, "password": test_password, "name": test_name}
    fallback_subscriptions[user_id] = {"user_id": user_id, "status": "free", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
    fallback_credits[user_id] = 100
    
    return {
        "message": "Test user created successfully",
        "email": test_email,
        "password": test_password,
        "name": test_name,
        "user_id": user_id
    }

# --- User Authentication Endpoints ---
# ... (keep /register and /login as they were, ensuring they handle fallback) ...
@app.post("/register", response_model=Token)
async def register_user(user: UserCreate):
    if MONGODB_ENABLED:
        try:
            existing_user = users_collection.find_one({"email": user.email})
            if existing_user:
                raise HTTPException(status_code=400, detail="Email already registered")

            # Use hashed password for storage
            hashed_password = get_password_hash(user.password)

            new_user = {
                "email": user.email,
                "password": hashed_password, # Store hash
                "name": user.name,
                "created_at": datetime.utcnow()
            }
            result = users_collection.insert_one(new_user)
            user_id = str(result.inserted_id)

            # Create free subscription
            new_subscription = { "user_id": user_id, "status": "free", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
            subscriptions_collection.insert_one(new_subscription)

            # Add initial free credits (e.g., 100)
            credits_collection.update_one(
                {"user_id": user_id, "type": "balance"},
                {"$set": {"balance": 100, "updated_at": datetime.utcnow()}, "$setOnInsert": {"created_at": datetime.utcnow()}},
                upsert=True
            )

            access_token = create_access_token({"sub": user_id, "email": user.email})
            return {"access_token": access_token, "token_type": "bearer", "user_id": user_id, "name": user.name}
        except Exception as e:
            print(f"MongoDB registration error: {e}")
            raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    else: # Fallback
        if user.email in fallback_users:
            raise HTTPException(status_code=400, detail="Email already registered")
        user_id = f"user_{len(fallback_users) + 1}"
        fallback_users[user.email] = {"id": user_id, "email": user.email, "password": user.password, "name": user.name}
        fallback_subscriptions[user_id] = {"user_id": user_id, "status": "free", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
        fallback_credits[user_id] = 100 # Give fallback users credits too
        access_token = create_access_token({"sub": user_id, "email": user.email})
        return {"access_token": access_token, "token_type": "bearer", "user_id": user_id, "name": user.name}


@app.post("/login", response_model=Token)
async def login_user(user: UserLogin):
    print(f"Login attempt for email: {user.email}")
    
    if MONGODB_ENABLED:
        try:
            db_user = users_collection.find_one({"email": user.email})
            print(f"User found in database: {bool(db_user)}")
            
            if not db_user:
                print(f"No user found with email: {user.email}")
                raise HTTPException(status_code=401, detail="Invalid email or password")
                
            password_valid = verify_password(user.password, db_user["password"])
            print(f"Password verification result: {password_valid}")
            
            if not password_valid:
                print(f"Invalid password for user: {user.email}")
                raise HTTPException(status_code=401, detail="Invalid email or password")

            user_id = str(db_user["_id"])
            access_token = create_access_token({"sub": user_id, "email": user.email})
            print(f"Login successful for user ID: {user_id}")
            return {"access_token": access_token, "token_type": "bearer", "user_id": user_id, "name": db_user["name"]}
        except HTTPException:
            raise
        except Exception as e:
            print(f"MongoDB login error: {e}")
            print(traceback.format_exc())  # Print full traceback for debugging
            raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
    else: # Fallback
        print(f"Using fallback login system. Available users: {list(fallback_users.keys())}")
        if user.email in fallback_users:
            fallback_user = fallback_users[user.email]
            password_match = fallback_user["password"] == user.password
            print(f"Fallback password match: {password_match}")
            
            if password_match:
                access_token = create_access_token({"sub": fallback_user["id"], "email": user.email})
                print(f"Fallback login successful for user ID: {fallback_user['id']}")
                return {"access_token": access_token, "token_type": "bearer", "user_id": fallback_user["id"], "name": fallback_user["name"]}
                
        print(f"Fallback login failed for: {user.email}")
        raise HTTPException(status_code=401, detail="Invalid email or password")


# --- Current User Dependency ---
async def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        print("No token provided")
        return None # Allow anonymous access or handle based on endpoint

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        email = payload.get("email") # Get email from payload

        if not user_id:
             print("Token missing user_id (sub)")
             return None

        if MONGODB_ENABLED:
            try:
                from bson.objectid import ObjectId
                user = users_collection.find_one({"_id": ObjectId(user_id)})
                if user:
                    user["id"] = str(user["_id"]) # Ensure 'id' field exists
                    print(f"Authenticated user (DB): {user['id']} - {user['email']}")
                    return user
                else:
                    print(f"User not found in DB: {user_id}")
                    # Continue to fallback check if user not found in MongoDB
            except Exception as e:
                print(f"Error retrieving user from DB: {e}")
                # Continue to fallback check on error

        # Fallback check - try whether MongoDB is enabled or not
        # Iterate through fallback users to find matching ID
        found_user = None
        for em, u_data in fallback_users.items():
             if u_data.get("id") == user_id:
                 found_user = u_data
                 break
        if found_user:
             print(f"Authenticated user (Fallback): {found_user['id']} - {found_user['email']}")
             return found_user
        else:
             print(f"User not found in fallback store: {user_id}")

        # If we reach here, no user was found in either database
        return None

    except jwt.ExpiredSignatureError:
        print("Token has expired")
        # Optionally raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"Invalid token: {e}")
        # Optionally raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        print(f"Token validation error: {e}")

    return None # Return None if authentication fails for any reason


# --- Core Analysis Endpoint (No Credit Check - Dispatches to LLMs) ---
@app.post("/analysis", response_model=ChessAnalysisResponse)
async def analyze_position(request: ChessAnalysisRequest):
    """
    Analyzes the chess position using the selected LLM.
    This endpoint does NOT check or deduct credits. Use /analysis-with-credit for that.
    """
    print(f"Received analysis request. Model: {request.model}, FEN: {request.fen}, PGN: {'Yes' if request.pgn else 'No'}, Image: {'Yes' if request.image_data else 'No'}, History: {len(request.chat_history)} items")
    print(f"Computer Analysis Provided: Eval='{request.computer_evaluation}', Variation='{request.computer_variation}'")

    try:
        # Validate FEN
        board = None
        fen_for_prompt = request.fen # Keep original potentially invalid FEN for prompt context
        if request.fen:
            try:
                board = chess.Board(request.fen) # Validate format
            except ValueError:
                # Don't raise error, let the LLM know it's invalid
                fen_for_prompt = f"INVALID FEN ({request.fen})"
                print("Invalid FEN received, passing info to LLM")

        # Process PGN for context
        game_analysis_context = ""
        if request.pgn:
            try:
                pgn_io = io.StringIO(request.pgn)
                game = chess.pgn.read_game(pgn_io)
                if game:
                    headers = game.headers
                    # Get last few moves sanely
                    moves_san = []
                    temp_board = game.board()
                    # Iterate through mainline moves to get SAN notation correctly
                    for move in game.mainline_moves():
                         moves_san.append(temp_board.san(move))
                         temp_board.push(move)
                    last_moves_str = " ".join(moves_san[-5:]) if moves_san else "No moves" # Get last 5 SAN moves
                    game_analysis_context = f"Game Info: {headers.get('White', '?')} vs {headers.get('Black', '?')} ({headers.get('Result', '*')}). Last 5 moves: ...{last_moves_str}"
                elif request.pgn.strip(): # If PGN is not empty but didn't parse as game
                    game_analysis_context = "PGN provided but could not be fully parsed as a game."
            except Exception as e:
                game_analysis_context = f"Error parsing PGN: {str(e)}"
                print(f"PGN parsing error: {e}")

        # --- Model Selection and Dispatch ---
        use_vision = bool(request.image_data)
        requested_model_id = request.model or DEFAULT_MODEL
        # Use the MODEL_MAP to get the canonical model ID, falling back to default
        selected_model = MODEL_MAP.get(requested_model_id, DEFAULT_MODEL)

        response_text = ""
        print(f"Dispatching to model: {selected_model}, Vision: {use_vision}")

        # Choose the correct API call based on the selected model family
        if selected_model in [MODEL_GPT4_O_MINI, MODEL_GPT4_O]:
            if not openai_client_available: raise HTTPException(status_code=503, detail="OpenAI API not configured")
            target_model = selected_model
            if use_vision:
                # Ensure a vision-capable model is used if an image is present
                if selected_model != MODEL_GPT4_O:
                    print(f"Warning: Model {selected_model} requested but vision needed. Upgrading to {MODEL_GPT4_O}.")
                    target_model = MODEL_GPT4_O
                response_text = await call_openai_vision_api(target_model, request.message, request.image_data, fen_for_prompt, game_analysis_context, request.chat_history, request.computer_evaluation, request.computer_variation)
            else:
                response_text = await call_openai_api(target_model, request.message, fen_for_prompt, game_analysis_context, request.chat_history, request.computer_evaluation, request.computer_variation)

        elif selected_model == MODEL_CLAUDE_3_5_SONNET:
            if not anthropic_client: raise HTTPException(status_code=503, detail="Anthropic API not configured")
            # Claude 3.5 Sonnet handles both text and vision
            response_text = await call_anthropic_api(selected_model, request.message, fen_for_prompt, game_analysis_context, request.chat_history, request.computer_evaluation, request.computer_variation, request.image_data if use_vision else None)

        elif selected_model == MODEL_GEMINI_1_5_FLASH:
            if not google_client_available: raise HTTPException(status_code=503, detail="Google Generative AI not configured")
            # Gemini 1.5 Flash handles both text and vision
            response_text = await call_gemini_api(selected_model, request.message, fen_for_prompt, game_analysis_context, request.chat_history, request.computer_evaluation, request.computer_variation, request.image_data if use_vision else None)

        else:
            # Fallback if the mapped model isn't handled (shouldn't happen with current map)
            print(f"Error: Model '{selected_model}' mapped but no handler found. Falling back to default.")
            if not openai_client_available: raise HTTPException(status_code=503, detail="Default API (OpenAI) not configured")
            response_text = await call_openai_api(DEFAULT_MODEL, request.message, fen_for_prompt, game_analysis_context, request.chat_history, request.computer_evaluation, request.computer_variation) # Fallback to default text model

        return ChessAnalysisResponse(response=response_text)

    except HTTPException:
        raise # Re-raise HTTP exceptions directly
    except Exception as e:
        print(f"Error processing analysis request: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="An internal error occurred during analysis.")

# --- System Prompt Helper ---
def build_system_prompt(fen: Optional[str], game_context: str, computer_eval: Optional[str], computer_var: Optional[str]) -> str:
    """Builds the system prompt for the LLM, including context."""
    prompt = "You are a helpful chess analysis assistant. Analyze the given chess position and conversation history to answer the user's latest question concisely and accurately. Use standard algebraic notation (SAN) for moves."
    if fen and "INVALID" not in fen: # Only include FEN if it seemed valid
        prompt += f"\nCurrent Position FEN: {fen}"
    elif fen: # Mention invalidity if FEN was provided but flagged
         prompt += f"\nNote: An invalid FEN was provided ({fen}). Rely primarily on the image if available, or ask for clarification if ambiguous."
    if game_context:
         prompt += f"\n{game_context}" # Include parsed PGN context
    if computer_eval or computer_var:
        # Add computer analysis hints if provided
        prompt += f"\nComputer Analysis Hint: Eval={computer_eval or 'N/A'}, Principal Variation={computer_var or 'N/A'}."
        prompt += " Briefly consider this computer analysis in your response if relevant, but focus on explaining the concepts and reasoning behind the user's query."
    return prompt

# --- LLM API Callers ---

async def call_openai_api(model: str, user_message: str, fen: Optional[str], game_context: str, chat_history: List[Message], comp_eval: Optional[str], comp_var: Optional[str]) -> str:
    """Calls OpenAI text-based models (e.g., gpt-4o-mini)."""
    if not OPENAI_API_KEY: return "OpenAI API key not configured."
    try:
        system_prompt = build_system_prompt(fen, game_context, comp_eval, comp_var)
        messages = [{"role": "system", "content": system_prompt}]
        # Add history, ensuring the last message is the user's current one
        for msg in chat_history:
            messages.append({"role": "user" if msg.sender == "user" else "assistant", "content": msg.text})

        print(f"Sending {len(messages)} messages to OpenAI ({model})")
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        payload = { "model": model, "messages": messages, "temperature": 0.5, "max_tokens": 800 }

        # Using sync requests for simplicity. Consider httpx for true async.
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=30)
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        result = response.json()

        # Safely access the response content
        if not result.get("choices") or not isinstance(result["choices"], list) or len(result["choices"]) == 0:
            print("Warning: OpenAI response missing 'choices'.")
            return "Error: Received unexpected response structure from OpenAI."
        choice = result["choices"][0]
        if not choice.get("message") or not isinstance(choice["message"], dict):
            print("Warning: OpenAI choice missing 'message'.")
            return "Error: Received unexpected response structure from OpenAI."
        content = choice["message"].get("content")
        if content is None:
            print("Warning: OpenAI message content is null.")
            finish_reason = choice.get("finish_reason", "unknown")
            return f"Error: OpenAI returned empty content (Finish reason: {finish_reason})."

        return str(content) # Ensure it's a string

    except requests.exceptions.Timeout:
        print(f"Timeout calling OpenAI API ({model})")
        return "Error: The request to the analysis engine timed out."
    except requests.exceptions.RequestException as e:
        print(f"Error calling OpenAI API ({model}): {e}")
        # Attempt to get more details from the response if available
        error_detail = str(e)
        if e.response is not None:
            try: error_detail = e.response.json()['error']['message']
            except: pass # Ignore if parsing fails
        return f"Error communicating with OpenAI analysis engine: {error_detail}"
    except Exception as e:
        print(f"Unexpected error in call_openai_api: {e}\n{traceback.format_exc()}")
        return f"An unexpected error occurred during OpenAI analysis."


async def call_openai_vision_api(model: str, user_message: str, image_data: str, fen: Optional[str], game_context: str, chat_history: List[Message], comp_eval: Optional[str], comp_var: Optional[str]) -> str:
    """Calls OpenAI vision models (e.g., gpt-4o)."""
    if not OPENAI_API_KEY: return "OpenAI API key not configured."
    try:
        system_prompt = build_system_prompt(fen, game_context, comp_eval, comp_var) + "\nAnalyze the provided chess board image and conversation history."
        messages = [{"role": "system", "content": system_prompt}]

        # Add history BEFORE the last user message which has the image
        for msg in chat_history[:-1]: # All messages except the last one
            messages.append({"role": "user" if msg.sender == "user" else "assistant", "content": msg.text})

        # Get the text of the last user message
        last_user_text = chat_history[-1].text if chat_history and chat_history[-1].sender == "user" else user_message

        # Ensure image data is just base64
        if image_data.startswith("data:image"):
             try: image_data = image_data.split(",")[1]
             except IndexError: raise ValueError("Invalid image data URL format")

        # Add the last user message including the image
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": last_user_text},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
            ]
        })

        print(f"Sending {len(messages)} messages to OpenAI Vision ({model})")
        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        payload = { "model": model, "messages": messages, "temperature": 0.5, "max_tokens": 1000 } # Allow more tokens for vision

        # Using sync requests. Consider httpx for async.
        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=45) # Longer timeout for vision
        response.raise_for_status()
        result = response.json()

        # Safe access to response content (same logic as non-vision)
        if not result.get("choices") or not isinstance(result["choices"], list) or len(result["choices"]) == 0:
            print("Warning: OpenAI Vision response missing 'choices'.")
            return "Error: Received unexpected response structure from OpenAI Vision."
        choice = result["choices"][0]
        if not choice.get("message") or not isinstance(choice["message"], dict):
            print("Warning: OpenAI Vision choice missing 'message'.")
            return "Error: Received unexpected response structure from OpenAI Vision."
        content = choice["message"].get("content")
        if content is None:
            print("Warning: OpenAI Vision message content is null.")
            finish_reason = choice.get("finish_reason", "unknown")
            return f"Error: OpenAI Vision returned empty content (Finish reason: {finish_reason})."

        return str(content)

    except requests.exceptions.Timeout:
        print(f"Timeout calling OpenAI Vision API ({model})")
        return "Error: The request to the vision analysis engine timed out."
    except requests.exceptions.RequestException as e:
        print(f"Error calling OpenAI Vision API ({model}): {e}")
        error_detail = str(e)
        if e.response is not None:
            try: error_detail = e.response.json()['error']['message']
            except: pass
        return f"Error communicating with OpenAI vision engine: {error_detail}"
    except Exception as e:
        print(f"Unexpected error in call_openai_vision_api: {e}\n{traceback.format_exc()}")
        return f"An unexpected error occurred during OpenAI Vision analysis."


async def call_anthropic_api(model: str, user_message: str, fen: Optional[str], game_context: str, chat_history: List[Message], comp_eval: Optional[str], comp_var: Optional[str], image_data: Optional[str] = None) -> str:
    """Calls Anthropic models (text or vision)."""
    if not anthropic_client: return "Anthropic API not configured."
    try:
        system_prompt = build_system_prompt(fen, game_context, comp_eval, comp_var)
        if image_data: system_prompt += "\nAnalyze the provided chess board image and conversation history."

        # Format messages for Anthropic (must alternate user/assistant)
        messages = []
        # Combine consecutive messages of the same role for Anthropic format
        last_role = None
        current_content_list = []

        history_to_process = chat_history or []

        for msg in history_to_process:
            current_role = "user" if msg.sender == "user" else "assistant"
            if last_role is None: # First message
                last_role = current_role
                current_content_list.append({"type": "text", "text": msg.text})
            elif current_role == last_role: # Combine with previous
                 # Check if last content item was text, append; otherwise add new text block
                 if current_content_list and current_content_list[-1]["type"] == "text":
                     current_content_list[-1]["text"] += "\n\n" + msg.text
                 else:
                     current_content_list.append({"type": "text", "text": msg.text})
            else: # Role changed, finalize previous message block
                if current_content_list:
                    messages.append({"role": last_role, "content": current_content_list})
                # Start new message block
                last_role = current_role
                current_content_list = [{"type": "text", "text": msg.text}]

        # Append the last processed block
        if current_content_list:
             messages.append({"role": last_role, "content": current_content_list})

        # Ensure the conversation ends with a user message (or add the current prompt)
        if not messages or messages[-1]['role'] != 'user':
             # If history was empty or ended with assistant, add the current user_message
             messages.append({"role": "user", "content": [{"type": "text", "text": user_message}]})
        # If history ended with user, the last message block IS the current one.

        # Add image to the *last user message* if provided
        if image_data and messages[-1]['role'] == 'user':
            if image_data.startswith("data:image"):
                try: image_data = image_data.split(",")[1]
                except IndexError: raise ValueError("Invalid image data URL format")

            media_type = "image/png" # Assuming PNG
            # Ensure content is a list before appending
            if isinstance(messages[-1]['content'], str):
                 messages[-1]['content'] = [{"type": "text", "text": messages[-1]['content']}]
            elif not isinstance(messages[-1]['content'], list):
                 messages[-1]['content'] = [{"type": "text", "text": str(messages[-1]['content'])}] # Fallback

            messages[-1]['content'].append({
                 "type": "image",
                 "source": { "type": "base64", "media_type": media_type, "data": image_data }
            })


        print(f"Sending {len(messages)} message blocks to Anthropic ({model})")
        # print("Anthropic Payload Sample:", json.dumps(messages[-1], indent=2)) # DEBUG last block

        # Use the async client initialized earlier
        response = await anthropic_client.messages.create(
            model=model,
            system=system_prompt,
            messages=messages,
            max_tokens=1000, # Adjust as needed
            temperature=0.5,
        )

        # Process response, handle potential errors or empty content
        if response.content and isinstance(response.content, list) and len(response.content) > 0:
            # Combine text blocks if response is multi-part
            return "".join([block.text for block in response.content if block.type == 'text'])
        elif response.stop_reason == 'error':
             print(f"Anthropic API error response: Type={response.type}, StopReason={response.stop_reason}")
             # Anthropic errors might be in the response object directly
             return f"Anthropic API returned an error (type: {response.type})."
        else:
             print("Warning: Anthropic returned an empty or unexpected response content:", response.content)
             return "Anthropic returned an empty response."

    except anthropic.APIError as e:
         print(f"Anthropic API error ({model}): Status={e.status_code}, Message={e.message}")
         return f"Error communicating with Anthropic engine: {e.message}"
    except Exception as e:
        print(f"Unexpected error in call_anthropic_api: {e}\n{traceback.format_exc()}")
        return f"An unexpected error occurred during Anthropic analysis."


async def call_gemini_api(model_name: str, user_message: str, fen: Optional[str], game_context: str, chat_history: List[Message], comp_eval: Optional[str], comp_var: Optional[str], image_data: Optional[str] = None) -> str:
    """Calls Google Gemini models (text or vision)."""
    if not google_client_available: return "Google Generative AI not configured."
    try:
        system_prompt = build_system_prompt(fen, game_context, comp_eval, comp_var)
        if image_data: system_prompt += "\nAnalyze the provided chess board image and conversation history."

        # Construct Gemini history (alternating user/model)
        gemini_history = []
        # Gemini prefers system instruction outside the main history if possible,
        # but we can prepend to the first user message if needed.
        # For simplicity here, we'll try to use the 'system_instruction' parameter if the model supports it,
        # otherwise, prepend like before. Let's assume model supports system_instruction for now.

        for msg in chat_history:
            role = "user" if msg.sender == "user" else "model"
            # Gemini expects 'parts' to be a list. Start with text.
            parts = [msg.text]
            gemini_history.append({'role': role, 'parts': parts})

        # Add image to the *last* message if it's from the user
        # Gemini expects image bytes, not base64 string directly in 'parts'
        if image_data and gemini_history and gemini_history[-1]['role'] == 'user':
             if image_data.startswith("data:image"):
                  try: image_data_b64 = image_data.split(",")[1]
                  except IndexError: raise ValueError("Invalid image data URL format")
             else:
                 image_data_b64 = image_data # Assume already base64

             try:
                  image_bytes = base64.b64decode(image_data_b64)
                  # Gemini uses dictionary format for images within parts
                  image_part = {"mime_type": "image/png", "data": image_bytes}
                  # Append the image part to the last user message's parts list
                  gemini_history[-1]['parts'].append(image_part)
             except Exception as img_err:
                  print(f"Error processing image for Gemini: {img_err}")
                  # Append error text instead of image
                  gemini_history[-1]['parts'].append("\n[System note: Error processing provided image data]")

        # Ensure the history doesn't start with 'model' role if system prompt isn't used
        if gemini_history and gemini_history[0]['role'] == 'model':
             # Prepend a dummy user message or adjust logic based on Gemini's requirements
             print("Warning: Gemini history starts with 'model'. Prepending system prompt as user message.")
             gemini_history.insert(0, {'role': 'user', 'parts': [system_prompt]}) # Or adjust system prompt handling


        print(f"Sending history to Google Gemini ({model_name})")
        # print("Gemini History Sample:", json.dumps(gemini_history[-1:], indent=2, default=lambda x: "<bytes>" if isinstance(x, bytes) else str(x))) # DEBUG last item

        model = genai.GenerativeModel(
             model_name,
             # Pass system prompt separately if model supports it
             system_instruction=system_prompt
        )
        # Use the async client initialized earlier
        response = await model.generate_content_async(
            gemini_history,
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=1000,
                temperature=0.6, # Adjust temperature as needed
            ),
            # safety_settings=... # Optional: Add safety settings if required
        )

        # --- Process Gemini Response ---
        try:
             # Check for blocked content first
             if not response.candidates:
                  block_reason = response.prompt_feedback.block_reason if response.prompt_feedback else "Unknown"
                  safety_ratings = response.prompt_feedback.safety_ratings if response.prompt_feedback else "N/A"
                  print(f"Gemini response blocked. Reason: {block_reason}, Safety Ratings: {safety_ratings}")
                  if block_reason == 'SAFETY': return "Response blocked due to safety settings."
                  else: return f"Response generation failed (Reason: {block_reason})."

             # Access the text content safely
             candidate = response.candidates[0]
             if candidate.content and candidate.content.parts:
                 # Combine text from all parts
                 return "".join(part.text for part in candidate.content.parts if hasattr(part, 'text'))
             else:
                 # Handle cases where content or parts might be missing
                 finish_reason = candidate.finish_reason
                 safety_ratings = candidate.safety_ratings
                 print(f"Gemini response missing content parts. Finish Reason: {finish_reason}, Safety: {safety_ratings}")
                 if finish_reason == 'SAFETY': return "Response blocked due to safety settings."
                 else: return f"Gemini returned empty content (Finish reason: {finish_reason})."

        except (AttributeError, IndexError, ValueError) as resp_err:
             print(f"Error parsing Gemini response: {resp_err}")
             print("Full Gemini Response:", response) # Log the full response for debugging
             return "Error processing response from Gemini engine."


    except Exception as e:
        print(f"Error calling Google Gemini API ({model_name}): {e}\n{traceback.format_exc()}")
        error_detail = str(e) # Basic error message
        # Add more specific parsing based on google API exceptions if needed
        return f"Error communicating with Google Gemini engine: {error_detail}"


# --- Payment/Subscription/Credit Endpoints ---
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET: print("Warning: Razorpay keys not found in environment variables.")
try: razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET else None
except Exception as e: print(f"Failed to initialize Razorpay: {e}"); razorpay_client = None

# --- Subscription Plans / Credit Packages Definitions ---
SUBSCRIPTION_PLANS = {
    "premium": {
        "monthly": {"amount": 49900, "currency": "INR", "interval": "monthly", "description": "Premium Monthly"},
        "yearly": {"amount": 499900, "currency": "INR", "interval": "yearly", "description": "Premium Yearly"}
    }
}
CREDIT_PACKAGES = { # Keys should match frontend 'data-package-id' values
    "basic":    {"amount": 19900,  "currency": "INR", "credits": 100,  "description": "Basic Pack"},
    "standard": {"amount": 49900,  "currency": "INR", "credits": 300,  "description": "Standard Pack"},
    "premium":  {"amount": 99900,  "currency": "INR", "credits": 750, "description": "Premium Pack"},
}

# --- Razorpay Signature Verification ---
def verify_razorpay_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Verifies the Razorpay payment signature."""
    if not RAZORPAY_KEY_SECRET:
        print("Error: Razorpay Key Secret is not configured.")
        return False
    msg = f"{order_id}|{payment_id}"
    try:
        generated_signature = hmac.new(RAZORPAY_KEY_SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()
        # Use compare_digest for timing attack resistance
        return hmac.compare_digest(generated_signature, signature)
    except Exception as e:
        print(f"Error verifying signature: {e}")
        return False

# --- Payment/Subscription/Credit Endpoints (Keep existing logic, ensure UTC for dates) ---

@app.get("/payments/credits/packages")
async def get_credit_packages(current_user: Optional[dict] = Depends(get_current_user)):
    """Returns the available credit packages."""
    if not current_user: raise HTTPException(status_code=401, detail="Authentication required")
    return {"packages": CREDIT_PACKAGES}

@app.post("/subscription/verify-payment")
async def verify_subscription_payment(payment: PaymentVerification, current_user: dict = Depends(get_current_user)):
    """Verifies a subscription payment and updates the user's status."""
    # Note: Depends(get_current_user) without Optional means it requires authentication
    if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

    if not verify_razorpay_signature(payment.razorpay_order_id, payment.razorpay_payment_id, payment.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    try:
        payment_details = razorpay_client.payment.fetch(payment.razorpay_payment_id)
        if payment_details.get('status') != 'captured':
            raise HTTPException(status_code=400, detail=f"Payment not captured (status: {payment_details.get('status')})")

        order_details = razorpay_client.order.fetch(payment.razorpay_order_id)
        if order_details['notes'].get('user_id') != current_user["id"]:
            raise HTTPException(status_code=403, detail="User ID mismatch in order notes")

        interval = order_details['notes'].get('interval')
        if not interval: raise HTTPException(status_code=400, detail="Missing interval in order notes")

        utc_now = datetime.now(timezone.utc)
        end_date = utc_now + timedelta(days=365 if interval == 'yearly' else 30) # Use UTC

        update_data = {
            "status": "premium",
            "start_date": utc_now,
            "end_date": end_date,
            "razorpay_payment_id": payment.razorpay_payment_id,
            "razorpay_order_id": payment.razorpay_order_id,
            "updated_at": utc_now
        }

        if MONGODB_ENABLED:
            subscriptions_collection.update_one(
                {"user_id": current_user["id"]},
                {"$set": update_data, "$setOnInsert": {"created_at": utc_now}}, # Use UTC
                upsert=True
            )
        else:
            fallback_subscriptions[current_user["id"]] = {"user_id": current_user["id"], **update_data, "created_at": fallback_subscriptions.get(current_user["id"], {}).get("created_at", utc_now)}

        print(f"Subscription activated for user {current_user['id']}")
        return {"success": True, "status": "premium", "expiry": end_date.isoformat()}

    except razorpay.errors.BadRequestError as rzp_err:
         print(f"Razorpay error verifying subscription: {rzp_err}")
         raise HTTPException(status_code=400, detail=f"Payment gateway error: {rzp_err}")
    except Exception as e:
        print(f"Error verifying subscription payment: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to verify subscription payment.")


@app.get("/subscription/status")
async def get_subscription_status(current_user: Optional[dict] = Depends(get_current_user)):
    """Gets the current subscription status for the logged-in user."""
    if not current_user: raise HTTPException(status_code=401, detail="Authentication required")

    subscription_data = None
    now = datetime.now(timezone.utc) # Use UTC for comparison

    if MONGODB_ENABLED:
        sub = subscriptions_collection.find_one({"user_id": current_user["id"]})
        if sub:
            # Check expiration if premium
            if sub.get("status") == "premium" and sub.get("end_date") and sub["end_date"].replace(tzinfo=timezone.utc) < now:
                print(f"Subscription expired for user {current_user['id']}. Updating to free.")
                subscriptions_collection.update_one({"_id": sub["_id"]}, {"$set": {"status": "free", "updated_at": now}})
                sub["status"] = "free" # Update local dict for response
            subscription_data = sub
        else:
            # Create free subscription if none exists
            print(f"No subscription found for user {current_user['id']}. Creating free tier.")
            new_sub = {"user_id": current_user["id"], "status": "free", "created_at": now, "updated_at": now}
            subscriptions_collection.insert_one(new_sub)
            subscription_data = new_sub
    else: # Fallback
        if current_user["id"] in fallback_subscriptions:
            sub = fallback_subscriptions[current_user["id"]]
            if sub.get("status") == "premium" and sub.get("end_date") and sub["end_date"].replace(tzinfo=timezone.utc) < now:
                sub["status"] = "free"
                sub["updated_at"] = now
            subscription_data = sub
        else:
            new_sub = {"user_id": current_user["id"], "status": "free", "created_at": now, "updated_at": now}
            fallback_subscriptions[current_user["id"]] = new_sub
            subscription_data = new_sub

    expiry_iso = None
    if subscription_data.get("status") == "premium" and subscription_data.get("end_date"):
         expiry_iso = subscription_data["end_date"].isoformat()

    return {
        "status": subscription_data.get("status", "free"),
        "expiry": expiry_iso
    }

@app.post("/subscription/create-order")
async def create_subscription_order(order: SubscriptionOrderCreate, current_user: dict = Depends(get_current_user)):
    """Creates a Razorpay order for a subscription."""
    if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

    if order.plan not in SUBSCRIPTION_PLANS or order.interval not in SUBSCRIPTION_PLANS[order.plan]:
        raise HTTPException(status_code=400, detail="Invalid subscription plan or interval")

    plan = SUBSCRIPTION_PLANS[order.plan][order.interval]
    # Use UTC timestamp for unique receipt ID
    receipt_id = f"sub_{current_user['id']}_{int(datetime.now(timezone.utc).timestamp())}"

    order_payload = {
        'amount': plan['amount'],
        'currency': plan['currency'],
        'receipt': receipt_id,
        'payment_capture': 1, # Auto capture payment
        'notes': {
            'user_id': current_user["id"],
            'type': 'subscription', # Add type for clarity
            'plan': order.plan,
            'interval': order.interval
        }
    }

    try:
        razorpay_order = razorpay_client.order.create(order_payload)
        print(f"Created Razorpay subscription order {razorpay_order['id']} for user {current_user['id']}")

        # Optionally store pending order ID reference (useful for reconciliation)
        utc_now = datetime.now(timezone.utc)
        if MONGODB_ENABLED:
             subscriptions_collection.update_one(
                 {"user_id": current_user["id"]},
                 {"$set": {"pending_order_id": razorpay_order['id'], "updated_at": utc_now}},
                 upsert=True # Create if user doc doesn't exist yet (should exist after register)
             )
        else:
             sub_data = fallback_subscriptions.get(current_user["id"], {"user_id": current_user["id"]})
             sub_data["pending_order_id"] = razorpay_order['id']
             sub_data["updated_at"] = utc_now
             fallback_subscriptions[current_user["id"]] = sub_data

        # Return details needed by frontend to initiate checkout
        return {
            "razorpay_key_id": RAZORPAY_KEY_ID,
            "razorpay_order_id": razorpay_order['id'],
            "amount": plan['amount'],
            "currency": plan['currency'],
            "description": plan['description'] # Description for checkout UI
        }
    except razorpay.errors.BadRequestError as rzp_err:
         print(f"Razorpay error creating subscription order: {rzp_err}")
         raise HTTPException(status_code=400, detail=f"Payment gateway error: {rzp_err}")
    except Exception as e:
        print(f"Error creating subscription order: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to create subscription order.")


@app.post("/credits/create-order")
async def create_credit_order(order: CreditPurchaseCreate, current_user: dict = Depends(get_current_user)):
    """Creates a Razorpay order for purchasing credits."""
    if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

    # Use order.package which matches the Pydantic model field name
    if order.package not in CREDIT_PACKAGES:
        raise HTTPException(status_code=400, detail=f"Invalid credit package ID: {order.package}")

    package = CREDIT_PACKAGES[order.package]
    utc_now = datetime.now(timezone.utc)
    receipt_id = f"cred_{current_user['id']}_{int(utc_now.timestamp())}"

    order_payload = {
        'amount': package['amount'],
        'currency': package['currency'],
        'receipt': receipt_id,
        'payment_capture': 1, # Auto capture
        'notes': {
            'user_id': current_user["id"],
            'type': 'credits', # Mark type as credits
            'package': order.package, # Store package ID
            'credits': package['credits'] # Store credits amount for verification clarity
        }
    }

    try:
        razorpay_order = razorpay_client.order.create(order_payload)
        print(f"Created Razorpay credits order {razorpay_order['id']} for user {current_user['id']}")

        # Store pending order details in credits collection (optional but good practice)
        if MONGODB_ENABLED:
            credits_collection.insert_one({
                "user_id": current_user["id"],
                "type": "pending_order",
                "razorpay_order_id": razorpay_order['id'],
                "package": order.package,
                "credits": package['credits'],
                "amount": package['amount'],
                "currency": package['currency'],
                "status": "pending",
                "created_at": utc_now
            })
        # No fallback needed for pending orders here, verify handles adding credits

        # Return details for frontend checkout
        return {
            "razorpay_key_id": RAZORPAY_KEY_ID,
            "razorpay_order_id": razorpay_order['id'],
            "amount": package['amount'],
            "currency": package['currency'],
            "description": package['description'], # For checkout UI
            "credits": package['credits'] # Send credits back for context
        }
    except razorpay.errors.BadRequestError as rzp_err:
         print(f"Razorpay error creating credit order: {rzp_err}")
         raise HTTPException(status_code=400, detail=f"Payment gateway error: {rzp_err}")
    except Exception as e:
        print(f"Error creating credit order: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to create credits order.")


@app.post("/credits/verify-payment")
async def verify_credit_payment(payment: PaymentVerification, current_user: dict = Depends(get_current_user)):
    """Verifies a credit purchase payment and updates the user's credit balance."""
    if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

    if not verify_razorpay_signature(payment.razorpay_order_id, payment.razorpay_payment_id, payment.razorpay_signature):
        raise HTTPException(status_code=400, detail="Invalid payment signature")

    try:
        # Fetch payment and order details from Razorpay for verification
        payment_details = razorpay_client.payment.fetch(payment.razorpay_payment_id)
        if payment_details.get('status') != 'captured':
            raise HTTPException(status_code=400, detail=f"Payment not captured (status: {payment_details.get('status')})")

        order_details = razorpay_client.order.fetch(payment.razorpay_order_id)
        notes = order_details.get('notes', {})

        # Verify crucial details from order notes
        if notes.get('user_id') != current_user["id"]:
            raise HTTPException(status_code=403, detail="User ID mismatch in order notes")
        if notes.get('type') != 'credits':
            raise HTTPException(status_code=400, detail="Order type is not 'credits'")

        # Get credits amount from order notes (source of truth)
        credits_to_add = int(notes.get('credits', 0))
        if credits_to_add <= 0:
            raise HTTPException(status_code=400, detail="Invalid or missing credits amount in order notes")

        package_id = notes.get('package') # Get package ID for logging/records

        utc_now = datetime.now(timezone.utc)
        current_balance = 0

        if MONGODB_ENABLED:
            # Update status of the pending order record (optional but good for tracking)
            credits_collection.update_one(
                {"user_id": current_user["id"], "type": "pending_order", "razorpay_order_id": payment.razorpay_order_id},
                {"$set": {
                    "status": "completed",
                    "razorpay_payment_id": payment.razorpay_payment_id,
                    "payment_captured_at": utc_now, # Record capture time
                    "updated_at": utc_now
                    }
                }
            )

            # Atomically update the user's credit balance using $inc
            # upsert=True ensures the balance document is created if it doesn't exist
            result = credits_collection.update_one(
                {"user_id": current_user["id"], "type": "balance"},
                {"$inc": {"balance": credits_to_add},
                 "$set": {"updated_at": utc_now},
                 "$setOnInsert": {"created_at": utc_now}}, # Set created_at only on insert
                upsert=True
            )

            # Fetch the updated balance for the response
            updated_credits_doc = credits_collection.find_one({"user_id": current_user["id"], "type": "balance"})
            current_balance = updated_credits_doc.get("balance", 0) if updated_credits_doc else credits_to_add

            # Log the successful credit addition
            credits_collection.insert_one({
                "user_id": current_user["id"], "type": "purchase", "amount": credits_to_add,
                "package": package_id, "razorpay_order_id": payment.razorpay_order_id,
                "razorpay_payment_id": payment.razorpay_payment_id, "created_at": utc_now
            })

        else: # Fallback
            fallback_credits[current_user["id"]] = fallback_credits.get(current_user["id"], 0) + credits_to_add
            current_balance = fallback_credits[current_user["id"]]
            # Note: Fallback lacks detailed logging and atomicity guarantees

        print(f"Credits added for user {current_user['id']}. Package: {package_id}, Added: {credits_to_add}, New Balance: {current_balance}")
        return {"success": True, "credits_added": credits_to_add, "current_balance": current_balance}

    except razorpay.errors.BadRequestError as rzp_err:
         print(f"Razorpay error verifying credit payment: {rzp_err}")
         raise HTTPException(status_code=400, detail=f"Payment gateway error: {rzp_err}")
    except Exception as e:
        print(f"Error verifying credit payment: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to process credit payment.")


@app.get("/credits/balance")
async def get_credit_balance(current_user: Optional[dict] = Depends(get_current_user)):
    """Gets the current credit balance for the logged-in user."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
        
    try:
        balance = 0
        if MONGODB_ENABLED:
            user_credits = credits_collection.find_one({"user_id": current_user["id"], "type": "balance"})
            balance = user_credits.get("balance", 0) if user_credits else 0
        else:
            balance = fallback_credits.get(current_user["id"], 0)

        # print(f"Credit balance for user {current_user['id']}: {balance}") # Reduce log noise
        return {"balance": balance}
    except Exception as e:
        print(f"Error fetching credit balance: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail="Failed to fetch credit balance.")


@app.post("/credits/use")
async def use_credits(request: Dict[str, Any], current_user: dict = Depends(get_current_user)):
    """Atomically deducts credits from a user's balance."""
    amount = request.get("amount", 1) # Default usage is 1 credit
    if not isinstance(amount, int) or amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid credit amount specified")

    context = request.get("context", "analysis") # Optional context for logging usage

    # print(f"Attempting to use {amount} credits for user {current_user['id']} (Context: {context})") # Reduce noise

    if MONGODB_ENABLED:
        try:
            # Atomically find the balance document and update if sufficient credits exist
            utc_now = datetime.now(timezone.utc)
            result = credits_collection.find_one_and_update(
                {
                    "user_id": current_user["id"],
                    "type": "balance",
                    "balance": {"$gte": amount} # Condition: balance must be >= amount
                },
                {
                    "$inc": {"balance": -amount}, # Decrement balance
                    "$set": {"updated_at": utc_now} # Update timestamp
                },
                # return_document=pymongo.ReturnDocument.AFTER # Requires pymongo >= 3. Return the updated document
                # For compatibility, we'll fetch again if update succeeds (less atomic view of new balance)
                projection={"balance": 1} # Only need balance
            )

            if result is None: # The find_one_and_update query found no matching document (insufficient balance)
                current_doc = credits_collection.find_one(
                    {"user_id": current_user["id"], "type": "balance"},
                    projection={"balance": 1}
                )
                current_balance = current_doc.get("balance", 0) if current_doc else 0
                print(f"Credit usage failed for user {current_user['id']}. Requested: {amount}, Balance: {current_balance}")
                raise HTTPException(status_code=402, detail="Insufficient credits") # 402 Payment Required

            # If update was successful, 'result' contains the document *before* update without ReturnDocument.AFTER
            # We need to fetch again to get the *new* balance accurately.
            updated_doc = credits_collection.find_one(
                {"user_id": current_user["id"], "type": "balance"},
                projection={"balance": 1}
            )
            new_balance = updated_doc.get("balance", 0) if updated_doc else 0


            # Log the usage transaction
            credits_collection.insert_one({
                "user_id": current_user["id"],
                "type": "usage",
                "amount": amount,
                "context": context,
                "new_balance_after": new_balance, # Log new balance for audit
                "created_at": utc_now
            })

            # print(f"Credits used (DB) for user {current_user['id']}. Used: {amount}, New Balance: {new_balance}") # Reduce noise
            return {"success": True, "credits_used": amount, "current_balance": new_balance}

        except HTTPException: raise # Re-raise 402 Insufficient credits
        except Exception as e:
            print(f"Error using credits (DB): {e}\n{traceback.format_exc()}")
            raise HTTPException(status_code=500, detail="Failed to process credit usage.")

    else: # Fallback
        current_balance = fallback_credits.get(current_user["id"], 0)
        if current_balance < amount:
            print(f"Fallback credit usage failed. Requested: {amount}, Balance: {current_balance}")
            raise HTTPException(status_code=402, detail="Insufficient credits")

        fallback_credits[current_user["id"]] -= amount
        new_balance = fallback_credits[current_user["id"]]
        # print(f"Fallback Credits used. Used: {amount}, New Balance: {new_balance}") # Reduce noise
        return {"success": True, "credits_used": amount, "current_balance": new_balance}


# --- Analysis Endpoint With Credit Check ---
@app.post("/analysis-with-credit", response_model=ChessAnalysisResponse)
async def analyze_with_credit(request: ChessAnalysisRequest, current_user: dict = Depends(get_current_user)):
    """ Endpoint for analysis that requires authentication and deducts credits. """
    # Determine cost based on model/vision
    credit_cost = 1 # Base cost
    requested_model_id = request.model or DEFAULT_MODEL
    selected_model = MODEL_MAP.get(requested_model_id, DEFAULT_MODEL)
    use_vision = bool(request.image_data)

    # Example Cost Logic (adjust as needed)
    if selected_model == MODEL_GPT4_O: credit_cost = 5
    elif selected_model == MODEL_CLAUDE_3_5_SONNET: credit_cost = 3 # Example cost
    elif use_vision: credit_cost = 2 # Slightly higher for vision

    print(f"Analysis request by {current_user['id']}. Model: {selected_model}, Vision: {use_vision}. Cost: {credit_cost} credit(s).")

    try:
        # --- 1. Deduct Credits First ---
        usage_context = f"analysis_{selected_model}{'_vision' if use_vision else ''}"
        credit_response = await use_credits({"amount": credit_cost, "context": usage_context}, current_user)
        remaining_credits = credit_response.get("current_balance", 0)
        print(f"Credit check passed for user {current_user['id']}. Remaining: {remaining_credits}")

        # --- 2. Perform Analysis ---
        # Call the main analysis dispatcher which handles model selection etc.
        analysis_result = await analyze_position(request)

        # --- 3. Format and Return Response ---
        # analysis_result should be a ChessAnalysisResponse Pydantic model instance
        analysis_data = analysis_result.dict() # Convert model to dict
        analysis_data["credits"] = {"used": credit_cost, "remaining": remaining_credits}

        # Return as ChessAnalysisResponse Pydantic model expects
        return ChessAnalysisResponse(**analysis_data)

    except HTTPException as e:
        # Specifically handle insufficient credits error from use_credits
        if e.status_code == 402:
            print(f"Analysis blocked for user {current_user['id']} due to insufficient credits.")
            # Return the specific 402 status code and detail
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Please purchase more credits."
            )
        else:
            # Re-raise other HTTP exceptions
            print(f"HTTP Exception during credit analysis: {e.status_code} - {e.detail}")
            raise e
    except Exception as e:
        # Catch unexpected errors during analysis or credit deduction
        print(f"Unexpected error during credit analysis for user {current_user['id']}: {e}\n{traceback.format_exc()}")
        # In a production system, you might attempt to refund credits here if deduction happened but analysis failed.
        raise HTTPException(status_code=500, detail="An internal error occurred during analysis.")


# --- Chess Utility Endpoints (Keep existing implementations) ---
@app.post("/validate/fen")
async def validate_fen(data: Dict[str, str]):
    """Validate a FEN string."""
    try: chess.Board(data.get("fen", "")); return {"valid": True}
    except ValueError as e: return {"valid": False, "error": str(e)}
@app.post("/validate/pgn")
async def validate_pgn(data: Dict[str, str]):
    """Validate a PGN string."""
    try:
        pgn_str = data.get("pgn", "")
        if not pgn_str.strip(): return {"valid": True, "warning": "Empty PGN string."} # Empty is structurally valid
        pgn_io = io.StringIO(pgn_str)
        # Try reading headers
        headers = chess.pgn.read_headers(pgn_io)
        # Reset and read game - this is the main validation
        pgn_io.seek(0)
        game = chess.pgn.read_game(pgn_io)
        if game is None:
             # Allow PGNs that might just be move lists (common from web scrapers)
             if pgn_str.strip().startswith("1."):
                 return {"valid": True, "warning": "PGN parsed, potentially moves only."}
             return {"valid": False, "error": "Could not parse PGN game structure."}
        # Check if moves exist if it's not just a setup position
        if not game.headers.get("SetUp") and not game.mainline_moves():
             return {"valid": True, "warning": "PGN valid but contains no moves."}
        return {"valid": True}
    except Exception as e: return {"valid": False, "error": f"Parsing error: {str(e)}"}

@app.post("/convert/fen-to-pgn")
async def fen_to_pgn(data: Dict[str, str]):
    """Convert a FEN position to a simple PGN with FEN header."""
    try:
        fen = data.get("fen", "").strip()
        if not fen: raise HTTPException(status_code=400, detail="FEN string is required.")
        try: board = chess.Board(fen) # Validate FEN
        except ValueError as e: raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}")
        game = chess.pgn.Game(); game.headers["FEN"] = fen; game.headers["SetUp"] = "1"; game.headers["Result"] = "*"
        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
        return {"pgn": game.accept(exporter)}
    except HTTPException: raise
    except Exception as e: print(f"Error converting FEN to PGN: {e}"); raise HTTPException(status_code=500, detail="Error converting FEN.")


# --- Uvicorn Runner ---
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0") # Listen on all interfaces
    # Default reload to False for production, True for dev via environment variable
    reload_flag = os.getenv("UVICORN_RELOAD", "false").lower() in ["true", "1", "yes"]
    log_level = os.getenv("UVICORN_LOG_LEVEL", "info").lower()

    print(f"Starting Chess Assistant API server on {host}:{port}")
    print(f"Reloading: {'Enabled' if reload_flag else 'Disabled'}")
    print(f"Log Level: {log_level}")
    print(f"MongoDB Enabled: {MONGODB_ENABLED}")
    print(f"OpenAI Available: {openai_client_available}")
    print(f"Anthropic Available: {bool(anthropic_client)}")
    print(f"Google Gemini Available: {google_client_available}")
    print(f"Razorpay Available: {bool(razorpay_client)}")

    uvicorn.run(
        "main2:app",
        host=host,
        port=port,
        reload=reload_flag,
        log_level=log_level
    )