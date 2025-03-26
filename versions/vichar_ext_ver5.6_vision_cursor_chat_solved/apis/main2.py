from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, EmailStr
from typing import List, Dict, Optional, Any
import chess
import chess.pgn
import io
import requests
import json
import os
import base64
from dotenv import load_dotenv
from pymongo import MongoClient
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta
import razorpay
import hmac
import hashlib

# Load environment variables
load_dotenv()

# Get API key from environment variables
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# MongoDB connection string - using the provided connection string
MONGODB_URI = os.getenv("MONGODB_URL", "mongodb+srv://user1:cartoon1@mongo-practice.slkil.mongodb.net/chess_assistant_db?retryWrites=true&w=majority&appName=Mongo-practice")

# JWT Secret
JWT_SECRET = os.getenv("JWT_SECRET", "your-secret-key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_MINUTES = 60 * 24  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Chess Assistant API")

# OAuth2 password bearer token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login", auto_error=False)

# Add CORS middleware - Keeping it broad for development/extension use
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins, including chrome-extension://
    allow_credentials=True,
    allow_methods=["*"], # Allows all methods
    allow_headers=["*"], # Allows all headers
)

# MongoDB connection with error handling
try:
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)  # 5 second timeout
    # Test connection
    client.admin.command('ping')
    print("MongoDB connection successful!")
    db = client["chess_assistant_db"]  # Use the database name from the connection string
    users_collection = db["users"]
    subscriptions_collection = db["subscriptions"]  # Add subscriptions collection
    credits_collection = db["credits"] # Define credits collection

    # Create indexes for users collection if they don't exist
    if "email_1" not in users_collection.index_information():
        users_collection.create_index("email", unique=True)
        print("Created email index")

    # Create indexes for subscriptions collection if they don't exist
    if "user_id_1" not in subscriptions_collection.index_information():
        subscriptions_collection.create_index("user_id", unique=True)
        print("Created user_id index for subscriptions")

    # Create indexes for credits collection
    if 'credits' not in db.list_collection_names():
        db.create_collection("credits")
        print("Created 'credits' collection")
    if "user_id_1" not in credits_collection.index_information():
         credits_collection.create_index("user_id")
         print("Created user_id index for credits")
    if "type_1_user_id_1" not in credits_collection.index_information():
         credits_collection.create_index([("type", 1), ("user_id", 1)]) # Index for balance lookup
         print("Created type_user_id index for credits")


    MONGODB_ENABLED = True
except Exception as e:
    print(f"MongoDB connection or setup failed: {e}")
    MONGODB_ENABLED = False
    # Fallback to in-memory user store
    fallback_users = {}
    fallback_subscriptions = {}
    fallback_credits = {} # Use a dictionary for fallback credits

# --- Pydantic Models ---
class Message(BaseModel):
    text: str
    sender: str # "user" or "assistant"

class ChessAnalysisRequest(BaseModel):
    message: str # The current user message
    fen: Optional[str] = None
    pgn: Optional[str] = None
    image_data: Optional[str] = None  # Base64 encoded image data
    chat_history: Optional[List[Message]] = [] # Full chat history INCLUDING the current message

class ChessAnalysisResponse(BaseModel):
    response: str
    credits: Optional[Dict[str, int]] = None # To return credit info

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
    user_id: str
    name: str

class SubscriptionOrderCreate(BaseModel):
    plan: str
    interval: str

class CreditPurchaseCreate(BaseModel):
    package: str

class PaymentVerification(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

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
    if MONGODB_ENABLED:
        try:
            db_user = users_collection.find_one({"email": user.email})
            if not db_user or not verify_password(user.password, db_user["password"]):
                raise HTTPException(status_code=401, detail="Invalid email or password")

            user_id = str(db_user["_id"])
            access_token = create_access_token({"sub": user_id, "email": user.email})
            return {"access_token": access_token, "token_type": "bearer", "user_id": user_id, "name": db_user["name"]}
        except HTTPException:
            raise
        except Exception as e:
            print(f"MongoDB login error: {e}")
            raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
    else: # Fallback
        if user.email in fallback_users and fallback_users[user.email]["password"] == user.password:
            fallback_user = fallback_users[user.email]
            access_token = create_access_token({"sub": fallback_user["id"], "email": user.email})
            return {"access_token": access_token, "token_type": "bearer", "user_id": fallback_user["id"], "name": fallback_user["name"]}
        raise HTTPException(status_code=401, detail="Invalid email or password")


# --- Current User Dependency ---
# ... (keep get_current_user as it was) ...
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
            except Exception as e:
                print(f"Error retrieving user from DB: {e}")
                pass # Allow fallback check

        # Fallback check
        if not MONGODB_ENABLED:
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


    except jwt.ExpiredSignatureError:
        print("Token has expired")
        # Optionally raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"Invalid token: {e}")
        # Optionally raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        print(f"Token validation error: {e}")

    return None # Return None if authentication fails for any reason

# --- Core Analysis Endpoint (No Credit Check Here) ---
@app.post("/analysis", response_model=ChessAnalysisResponse)
async def analyze_position(request: ChessAnalysisRequest):
    print(f"Received analysis request. FEN: {request.fen}, PGN: {'Yes' if request.pgn else 'No'}, Image: {'Yes' if request.image_data else 'No'}, History: {len(request.chat_history)} items")
    try:
        # Validate FEN if provided
        board = None
        if request.fen:
            try:
                board = chess.Board(request.fen)
            except ValueError:
                # Don't raise error, let the LLM know it's invalid
                request.fen = f"INVALID FEN ({request.fen})"
                print("Invalid FEN received, passing info to LLM")

        # Process PGN if provided
        game_analysis_context = ""
        if request.pgn:
            try:
                pgn_io = io.StringIO(request.pgn)
                game = chess.pgn.read_game(pgn_io)
                if game:
                    headers = game.headers
                    white = headers.get("White", "?")
                    black = headers.get("Black", "?")
                    result = headers.get("Result", "*")
                    # Get last few moves for context if helpful
                    moves = list(game.mainline_moves())
                    last_moves_str = " ".join([board.san(m) for m in moves[-5:]]) if moves else "No moves"
                    game_analysis_context = f"Game Info: {white} vs {black} ({result}). Last moves: ...{last_moves_str}"
                else:
                     game_analysis_context = "PGN provided but could not be parsed as a game."
            except Exception as e:
                game_analysis_context = f"Error parsing PGN: {str(e)}"
                print(f"PGN parsing error: {e}")

        # Determine if vision model should be used
        use_vision = bool(request.image_data)
        print(f"Using Vision API: {use_vision}")

        # Call the appropriate LLM API
        if use_vision:
            response_text = call_vision_api(request.message, request.image_data, request.fen, game_analysis_context, request.chat_history)
        else:
            response_text = call_llm_api(request.message, request.fen, game_analysis_context, request.chat_history)

        return ChessAnalysisResponse(response=response_text)

    except Exception as e:
        print(f"Error processing analysis request: {str(e)}")
        # Consider logging the full traceback here
        raise HTTPException(status_code=500, detail=f"Error processing analysis request: {str(e)}")


# --- Updated LLM API Callers ---

def call_llm_api(user_message: str, fen: Optional[str], game_context: str, chat_history: List[Message]) -> str:
    """ Call OpenAI LLM API with chat history. """
    if not OPENAI_API_KEY:
        return "API key not configured. Cannot perform analysis."

    try:
        # --- Construct the message list for OpenAI ---
        messages = []

        # 1. System Prompt
        system_prompt = "You are a helpful chess analysis assistant. Analyze the given chess position (if provided via FEN) and the conversation history to answer the user's latest question concisely and accurately."
        if fen:
            system_prompt += f"\nCurrent Position FEN: {fen}"
        if game_context:
             system_prompt += f"\n{game_context}"
        messages.append({"role": "system", "content": system_prompt})

        # 2. Add Conversation History
        for message in chat_history:
             # Map sender ("user"/"assistant") to OpenAI role ("user"/"assistant")
             role = "user" if message.sender == "user" else "assistant"
             messages.append({"role": role, "content": message.text})

        # Note: The last message in chat_history is the current user message.
        # OpenAI generally expects the history to end with the user's prompt.

        print(f"Sending {len(messages)} messages to OpenAI (non-vision)")
        # print("Messages Payload:", json.dumps(messages, indent=2)) # DEBUG: Print payload

        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "gpt-4o-mini", # Use a cost-effective model
            "messages": messages,
            "temperature": 0.5, # Slightly more deterministic for analysis
            "max_tokens": 800
        }

        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=30) # 30s timeout

        response.raise_for_status() # Raise exception for bad status codes
        result = response.json()
        return result["choices"][0]["message"]["content"]

    except requests.exceptions.RequestException as e:
        print(f"Error calling OpenAI API: {e}")
        return f"Error communicating with analysis engine: {e}"
    except Exception as e:
        print(f"Unexpected error in call_llm_api: {e}")
        return f"An unexpected error occurred during analysis: {e}"

def call_vision_api(user_message: str, image_data: str, fen: Optional[str], game_context: str, chat_history: List[Message]) -> str:
    """ Call GPT-4o Vision API with image and chat history. """
    if not OPENAI_API_KEY:
        return "API key not configured. Cannot perform vision analysis."

    try:
        # --- Construct the message list for OpenAI ---
        messages = []

        # 1. System Prompt (similar to non-vision)
        system_prompt = "You are a helpful chess analysis assistant. Analyze the provided chess board image and conversation history to answer the user's latest question. Use the FEN and game context for verification if available."
        if fen:
            system_prompt += f"\nProvided Position FEN (for reference/verification): {fen}"
        if game_context:
             system_prompt += f"\n{game_context}"
        messages.append({"role": "system", "content": system_prompt})

        # 2. Add Conversation History (excluding the last user message which will contain the image)
        history_to_send = chat_history[:-1] # Send all except the last item
        for message in history_to_send:
            role = "user" if message.sender == "user" else "assistant"
            messages.append({"role": role, "content": message.text})

        # 3. Add the Last User Message with Image
        if not chat_history: # Should not happen if called correctly, but handle defensively
             print("Warning: call_vision_api called with empty chat_history")
             last_user_text = user_message # Use the passed user_message directly
        else:
             last_user_message = chat_history[-1]
             if last_user_message.sender != "user":
                 print("Warning: Last message in history for vision call is not from user.")
                 last_user_text = user_message # Fallback
             else:
                 last_user_text = last_user_message.text

        # Clean base64 string
        if image_data.startswith("data:image"):
            image_data = image_data.split(",")[1]

        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": last_user_text}, # The actual user prompt text
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}}
            ]
        })

        print(f"Sending {len(messages)} messages to OpenAI (vision)")
        # print("Messages Payload:", json.dumps(messages, indent=2)) # DEBUG: Print payload

        headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
        payload = {
            "model": "gpt-4o", # Must use vision-capable model
            "messages": messages,
            "temperature": 0.5,
            "max_tokens": 1000
        }

        response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=45) # Longer timeout for vision

        response.raise_for_status()
        result = response.json()
        return result["choices"][0]["message"]["content"]

    except requests.exceptions.RequestException as e:
        print(f"Error calling OpenAI Vision API: {e}")
        return f"Error communicating with vision analysis engine: {e}"
    except Exception as e:
        print(f"Unexpected error in call_vision_api: {e}")
        return f"An unexpected error occurred during vision analysis: {e}"


# --- Razorpay and Payments ---
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "rzp_test_JB7DxS1VpotPXc") # Use env var or default test key
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "YJx0bpKe6D3JQuVyNZv6jACy") # Use env var or default test secret

# Ensure keys are loaded
if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
    print("Warning: Razorpay Key ID or Secret not found in environment variables. Using default test keys.")
elif "test" not in RAZORPAY_KEY_ID:
     print("Using LIVE Razorpay keys.")

try:
    razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
except Exception as e:
    print(f"Failed to initialize Razorpay client: {e}")
    razorpay_client = None

# --- Subscription Plans / Credit Packages Definitions ---
# ... (keep SUBSCRIPTION_PLANS and CREDIT_PACKAGES as they were) ...
SUBSCRIPTION_PLANS = {
    "premium": {
        "monthly": {"amount": 49900, "currency": "INR", "interval": "monthly", "description": "Premium Monthly Subscription"},
        "yearly": {"amount": 499900, "currency": "INR", "interval": "yearly", "description": "Premium Yearly Subscription"}
    }
}
CREDIT_PACKAGES = {
    "basic":    {"amount": 19900,  "currency": "INR", "credits": 100,  "description": "Basic Pack (100 Credits)"}, # Example INR pricing
    "standard": {"amount": 49900,  "currency": "INR", "credits": 300,  "description": "Standard Pack (300 Credits)"},
    "premium":  {"amount": 99900,  "currency": "INR", "credits": 750, "description": "Premium Pack (750 Credits)"},
    "test_usd": {"amount": 100,    "currency": "USD", "credits": 10,   "description": "Test USD Pack (10 Credits)"} # Keep a USD option for testing if needed
}


# --- Razorpay Signature Verification ---
def verify_razorpay_signature(order_id, payment_id, signature):
    if not RAZORPAY_KEY_SECRET:
        print("Error: Razorpay Key Secret is not configured.")
        return False
    msg = f"{order_id}|{payment_id}"
    try:
        generated_signature = hmac.new(
            key=RAZORPAY_KEY_SECRET.encode(),
            msg=msg.encode(),
            digestmod=hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(generated_signature, signature)
    except Exception as e:
        print(f"Error verifying signature: {e}")
        return False

# --- Payment/Subscription/Credit Endpoints ---
# ... (keep /payments/credits/packages, /subscription/*, /credits/create-order, /credits/verify-payment, /credits/balance, /credits/use) ...
# Make sure /credits/use and /credits/verify-payment correctly interact with the fallback_credits dictionary if MONGODB_ENABLED is False.
@app.get("/payments/credits/packages")
async def get_credit_packages(current_user = Depends(get_current_user)):
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return {"packages": CREDIT_PACKAGES}

@app.post("/subscription/verify-payment")
async def verify_payment(payment: PaymentVerification, current_user = Depends(get_current_user)):
    # ... (Implementation remains largely the same) ...
     if not current_user: raise HTTPException(status_code=401, detail="Authentication required")
     if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

     if not verify_razorpay_signature(payment.razorpay_order_id, payment.razorpay_payment_id, payment.razorpay_signature):
         raise HTTPException(status_code=400, detail="Invalid payment signature")

     try:
         payment_details = razorpay_client.payment.fetch(payment.razorpay_payment_id)
         if payment_details['status'] != 'captured': raise HTTPException(status_code=400, detail="Payment not captured")

         order_details = razorpay_client.order.fetch(payment.razorpay_order_id)
         order_user_id = order_details['notes']['user_id']
         plan = order_details['notes']['plan']
         interval = order_details['notes']['interval']

         if order_user_id != current_user["id"]: raise HTTPException(status_code=403, detail="User ID mismatch")

         end_date = datetime.utcnow() + timedelta(days=365 if interval == 'yearly' else 30)

         update_data = {
             "status": "premium", "start_date": datetime.utcnow(), "end_date": end_date,
             "razorpay_payment_id": payment.razorpay_payment_id, "razorpay_order_id": payment.razorpay_order_id,
             "updated_at": datetime.utcnow()
         }

         if MONGODB_ENABLED:
             subscriptions_collection.update_one(
                 {"user_id": current_user["id"]}, {"$set": update_data, "$setOnInsert": {"created_at": datetime.utcnow()}}, upsert=True
             )
         else:
             fallback_subscriptions[current_user["id"]] = {"user_id": current_user["id"], **update_data}

         return {"success": True, "status": "premium", "expiry": end_date.isoformat()}
     except Exception as e:
         print(f"Error verifying subscription payment: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to verify payment: {str(e)}")

@app.get("/subscription/manage")
async def manage_subscription(current_user = Depends(get_current_user)):
    # ... (Implementation remains the same) ...
    if not current_user: raise HTTPException(status_code=401, detail="Authentication required")
    return {"message": "Subscription management UI/logic would be here"}

@app.get("/subscription/status")
async def get_subscription_status(current_user = Depends(get_current_user)):
    # ... (Implementation remains largely the same, check expiration) ...
    if not current_user: raise HTTPException(status_code=401, detail="Authentication required")

    subscription_data = None
    now = datetime.utcnow()

    if MONGODB_ENABLED:
        subscription = subscriptions_collection.find_one({"user_id": current_user["id"]})
        if subscription:
            # Check expiration
            if subscription.get("status") == "premium" and subscription.get("end_date") and subscription["end_date"] < now:
                subscriptions_collection.update_one({"_id": subscription["_id"]}, {"$set": {"status": "free", "updated_at": now}})
                subscription["status"] = "free" # Update local copy
            subscription_data = subscription
        else:
            # Create free if not found
             new_sub = {"user_id": current_user["id"], "status": "free", "created_at": now, "updated_at": now}
             subscriptions_collection.insert_one(new_sub)
             subscription_data = new_sub

    else: # Fallback
        if current_user["id"] in fallback_subscriptions:
            subscription = fallback_subscriptions[current_user["id"]]
            if subscription.get("status") == "premium" and subscription.get("end_date") and subscription["end_date"] < now:
                subscription["status"] = "free"
                subscription["updated_at"] = now
            subscription_data = subscription
        else:
            new_sub = {"user_id": current_user["id"], "status": "free", "created_at": now, "updated_at": now}
            fallback_subscriptions[current_user["id"]] = new_sub
            subscription_data = new_sub

    return {
        "status": subscription_data.get("status", "free"),
        "expiry": subscription_data.get("end_date").isoformat() if subscription_data.get("status") == "premium" and subscription_data.get("end_date") else None
    }


@app.post("/subscription/create-order")
async def create_subscription_order(order: SubscriptionOrderCreate, current_user = Depends(get_current_user)):
    # ... (Implementation remains largely the same) ...
     if not current_user: raise HTTPException(status_code=401, detail="Authentication required")
     if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

     if order.plan not in SUBSCRIPTION_PLANS or order.interval not in SUBSCRIPTION_PLANS[order.plan]:
         raise HTTPException(status_code=400, detail="Invalid subscription plan or interval")

     plan = SUBSCRIPTION_PLANS[order.plan][order.interval]
     receipt_id = f"sub_{current_user['id']}_{int(datetime.utcnow().timestamp())}"

     try:
         razorpay_order = razorpay_client.order.create({
             'amount': plan['amount'], 'currency': plan['currency'], 'receipt': receipt_id, 'payment_capture': 1,
             'notes': {'user_id': current_user["id"], 'plan': order.plan, 'interval': order.interval}
         })

         # Store order ID reference temporarily if needed (e.g., in subscription doc)
         if MONGODB_ENABLED:
              subscriptions_collection.update_one(
                  {"user_id": current_user["id"]},
                  {"$set": {"pending_order_id": razorpay_order['id'], "updated_at": datetime.utcnow()}},
                  upsert=True # Create if doesn't exist
              )
         else:
              if current_user["id"] not in fallback_subscriptions: fallback_subscriptions[current_user["id"]] = {"user_id": current_user["id"]}
              fallback_subscriptions[current_user["id"]]["pending_order_id"] = razorpay_order['id']
              fallback_subscriptions[current_user["id"]]["updated_at"] = datetime.utcnow()


         return {
             "razorpay_key_id": RAZORPAY_KEY_ID, "razorpay_order_id": razorpay_order['id'],
             "amount": plan['amount'], "currency": plan['currency'], "description": plan['description']
         }
     except Exception as e:
         print(f"Error creating subscription order: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")


@app.post("/credits/create-order")
async def create_credit_order(order: CreditPurchaseCreate, current_user = Depends(get_current_user)):
    # ... (Implementation remains largely the same) ...
     if not current_user: raise HTTPException(status_code=401, detail="Authentication required")
     if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

     if order.package not in CREDIT_PACKAGES:
         raise HTTPException(status_code=400, detail="Invalid credit package")

     package = CREDIT_PACKAGES[order.package]
     receipt_id = f"cred_{current_user['id']}_{int(datetime.utcnow().timestamp())}"

     try:
         razorpay_order = razorpay_client.order.create({
             'amount': package['amount'], 'currency': package['currency'], 'receipt': receipt_id, 'payment_capture': 1,
             'notes': {'user_id': current_user["id"], 'type': 'credits', 'package': order.package, 'credits': package['credits']}
         })

         # Store pending order in credits collection
         if MONGODB_ENABLED:
             credits_collection.insert_one({
                 "user_id": current_user["id"], "type": "pending_order", "razorpay_order_id": razorpay_order['id'],
                 "package": order.package, "credits": package['credits'], "status": "pending", "created_at": datetime.utcnow()
             })

         return {
             "razorpay_key_id": RAZORPAY_KEY_ID, "razorpay_order_id": razorpay_order['id'],
             "amount": package['amount'], "currency": package['currency'],
             "description": package['description'], "credits": package['credits']
         }
     except Exception as e:
         print(f"Error creating credit order: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to create order: {str(e)}")


@app.post("/credits/verify-payment")
async def verify_credit_payment(payment: PaymentVerification, current_user = Depends(get_current_user)):
    # ... (Implementation remains largely the same, update balance) ...
     if not current_user: raise HTTPException(status_code=401, detail="Authentication required")
     if not razorpay_client: raise HTTPException(status_code=503, detail="Payment gateway not available")

     if not verify_razorpay_signature(payment.razorpay_order_id, payment.razorpay_payment_id, payment.razorpay_signature):
         raise HTTPException(status_code=400, detail="Invalid payment signature")

     try:
         payment_details = razorpay_client.payment.fetch(payment.razorpay_payment_id)
         if payment_details['status'] != 'captured': raise HTTPException(status_code=400, detail="Payment not captured")

         order_details = razorpay_client.order.fetch(payment.razorpay_order_id)
         order_user_id = order_details['notes']['user_id']
         order_type = order_details['notes'].get('type')

         if order_type != 'credits': raise HTTPException(status_code=400, detail="Not a credits order")
         if order_user_id != current_user["id"]: raise HTTPException(status_code=403, detail="User ID mismatch")

         credits_to_add = int(order_details['notes']['credits'])
         current_balance = 0

         if MONGODB_ENABLED:
             # Update pending order status
             credits_collection.update_one(
                 {"user_id": current_user["id"], "type": "pending_order", "razorpay_order_id": payment.razorpay_order_id},
                 {"$set": {"status": "completed", "razorpay_payment_id": payment.razorpay_payment_id, "updated_at": datetime.utcnow()}}
             )
             # Add credits to balance using $inc and upsert
             result = credits_collection.update_one(
                 {"user_id": current_user["id"], "type": "balance"},
                 {"$inc": {"balance": credits_to_add}, "$set": {"updated_at": datetime.utcnow()}, "$setOnInsert": {"created_at": datetime.utcnow()}},
                 upsert=True
             )
             # Fetch updated balance
             updated_credits_doc = credits_collection.find_one({"user_id": current_user["id"], "type": "balance"})
             current_balance = updated_credits_doc.get("balance", 0) if updated_credits_doc else credits_to_add

         else: # Fallback
             fallback_credits[current_user["id"]] = fallback_credits.get(current_user["id"], 0) + credits_to_add
             current_balance = fallback_credits[current_user["id"]]

         print(f"Credits added for user {current_user['id']}. Added: {credits_to_add}, New Balance: {current_balance}")
         return {"success": True, "credits_added": credits_to_add, "current_balance": current_balance}

     except Exception as e:
         print(f"Error verifying credit payment: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to process credit payment: {str(e)}")


@app.get("/credits/balance")
async def get_credit_balance(current_user = Depends(get_current_user)):
    # ... (Implementation remains largely the same) ...
     if not current_user: raise HTTPException(status_code=401, detail="Authentication required")
     try:
         if MONGODB_ENABLED:
             user_credits = credits_collection.find_one({"user_id": current_user["id"], "type": "balance"})
             balance = user_credits.get("balance", 0) if user_credits else 0
             print(f"Credit balance for user {current_user['id']}: {balance}")
             return {"balance": balance}
         else: # Fallback
             balance = fallback_credits.get(current_user["id"], 0)
             print(f"Fallback Credit balance for user {current_user['id']}: {balance}")
             return {"balance": balance}
     except Exception as e:
         print(f"Error fetching credit balance: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to fetch credit balance: {str(e)}")


@app.post("/credits/use")
async def use_credits(request: Dict[str, int], current_user = Depends(get_current_user)):
    # ... (Implementation remains largely the same, check balance before decrement) ...
     if not current_user: raise HTTPException(status_code=401, detail="Authentication required")

     amount = request.get("amount", 1) # Default to 1 credit if not specified
     if not isinstance(amount, int) or amount <= 0:
         raise HTTPException(status_code=400, detail="Invalid credit amount requested")

     print(f"Attempting to use {amount} credits for user {current_user['id']}")

     try:
         if MONGODB_ENABLED:
             # Atomically find and decrement if sufficient balance exists
             result = credits_collection.find_one_and_update(
                 {"user_id": current_user["id"], "type": "balance", "balance": {"$gte": amount}},
                 {"$inc": {"balance": -amount}, "$set": {"updated_at": datetime.utcnow()}},
                 return_document=True # Return the updated document
             )

             if not result: # Update failed, likely insufficient credits
                 # Check current balance to confirm
                 current_doc = credits_collection.find_one({"user_id": current_user["id"], "type": "balance"})
                 current_balance = current_doc.get("balance", 0) if current_doc else 0
                 print(f"Credit usage failed for user {current_user['id']}. Requested: {amount}, Balance: {current_balance}")
                 raise HTTPException(status_code=402, detail="Insufficient credits") # 402 Payment Required

             new_balance = result.get("balance", 0)

             # Log usage (optional but good practice)
             credits_collection.insert_one({
                 "user_id": current_user["id"], "type": "usage", "amount": amount,
                 "context": request.get("context", "analysis"), # Add context if provided
                 "created_at": datetime.utcnow()
             })
             print(f"Credits used successfully for user {current_user['id']}. Used: {amount}, New Balance: {new_balance}")
             return {"success": True, "credits_used": amount, "current_balance": new_balance}

         else: # Fallback
             current_balance = fallback_credits.get(current_user["id"], 0)
             if current_balance < amount:
                 print(f"Fallback Credit usage failed for user {current_user['id']}. Requested: {amount}, Balance: {current_balance}")
                 raise HTTPException(status_code=402, detail="Insufficient credits")

             fallback_credits[current_user["id"]] -= amount
             new_balance = fallback_credits[current_user["id"]]
             print(f"Fallback Credits used successfully for user {current_user['id']}. Used: {amount}, New Balance: {new_balance}")
             return {"success": True, "credits_used": amount, "current_balance": new_balance}

     except HTTPException:
         raise # Re-raise specific HTTP exceptions (like 402)
     except Exception as e:
         print(f"Error using credits: {e}")
         raise HTTPException(status_code=500, detail=f"Failed to use credits: {str(e)}")


# --- Analysis Endpoint With Credit Check ---
@app.post("/analysis-with-credit", response_model=ChessAnalysisResponse)
async def analyze_with_credit(request: ChessAnalysisRequest, current_user = Depends(get_current_user)):
    """ Analyze position after deducting credits. """
    if not current_user:
        raise HTTPException(status_code=401, detail="Authentication required")

    credit_cost = 1 # Cost per analysis call (adjust as needed)

    try:
        # --- 1. Deduct Credits First ---
        credit_response = await use_credits({"amount": credit_cost, "context": "analysis"}, current_user)
        remaining_credits = credit_response.get("current_balance", 0)
        print(f"Credit check passed for user {current_user['id']}. Remaining: {remaining_credits}")

        # --- 2. Perform Analysis ---
        analysis_result = await analyze_position(request) # Reuse the core analysis logic

        # --- 3. Add Credit Info to Response ---
        # Ensure analysis_result is a dict before adding keys
        if isinstance(analysis_result, ChessAnalysisResponse):
             analysis_data = analysis_result.dict()
        elif isinstance(analysis_result, dict):
             analysis_data = analysis_result
        else: # Should not happen if analyze_position returns correctly
             analysis_data = {"response": str(analysis_result)} # Fallback

        analysis_data["credits"] = {"used": credit_cost, "remaining": remaining_credits}

        # Return as ChessAnalysisResponse Pydantic model expects
        return ChessAnalysisResponse(**analysis_data)

    except HTTPException as e:
        # Catch specific 402 error from use_credits
        if e.status_code == 402:
            print(f"Analysis blocked due to insufficient credits for user {current_user['id']}")
            raise HTTPException(
                status_code=402,
                detail="Insufficient credits. Please purchase more credits to continue."
            )
        else:
            # Re-raise other HTTP exceptions
            print(f"HTTP Exception during credit analysis: {e.status_code} - {e.detail}")
            raise e
    except Exception as e:
        # Catch unexpected errors during analysis or credit deduction
        print(f"Unexpected error during credit analysis: {e}")
        # Consider if credits should be refunded here in a real system
        raise HTTPException(status_code=500, detail=f"An error occurred during analysis: {str(e)}")


# --- Chess Utility Endpoints ---
# ... (keep /validate/fen, /validate/pgn, /convert/fen-to-pgn as they were) ...
@app.post("/validate/fen")
async def validate_fen(data: Dict[str, str]):
    """Validate a FEN string"""
    try:
        fen = data.get("fen", "")
        chess.Board(fen)
        return {"valid": True}
    except ValueError as e:
        return {"valid": False, "error": str(e)}

@app.post("/validate/pgn")
async def validate_pgn(data: Dict[str, str]):
    """Validate a PGN string"""
    try:
        pgn = data.get("pgn", "")
        pgn_io = io.StringIO(pgn)
        # Try reading headers first for quick check
        headers = chess.pgn.read_headers(pgn_io)
        if headers is None and len(pgn) > 50: # Simple check if it looks like PGN but fails header read
             return {"valid": False, "error": "Could not parse PGN headers"}
        # Reset pointer and try reading the full game
        pgn_io.seek(0)
        game = chess.pgn.read_game(pgn_io)
        # Even an empty PGN might be "valid" structurally, but maybe we want moves?
        if game is None and len(pgn.strip()) > 0:
             # Check if it looks like just moves without headers
             if pgn.strip().startswith("1."):
                 # Potentially just moves, might consider it "valid" for analysis
                 return {"valid": True, "warning": "PGN seems to contain only moves, no headers."}
             return {"valid": False, "error": "Could not parse PGN game"}
        return {"valid": True}
    except Exception as e:
        return {"valid": False, "error": str(e)}


@app.post("/convert/fen-to-pgn")
async def fen_to_pgn(data: Dict[str, str]):
    """Convert a FEN position to a simple PGN with FEN header"""
    try:
        fen = data.get("fen", "").strip()
        if not fen:
             return {"error": "FEN string is required."}
        # Validate FEN before proceeding
        try:
            board = chess.Board(fen)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}")

        game = chess.pgn.Game()
        # Set FEN and Setup headers for clarity
        game.headers["FEN"] = fen
        game.headers["SetUp"] = "1" # Indicates position is set up from FEN
        game.headers["Result"] = "*" # Default result

        # The board state is implicitly set by the headers, no need for game.setup(board)

        exporter = chess.pgn.StringExporter(headers=True, variations=False, comments=False)
        pgn_string = game.accept(exporter)

        return {"pgn": pgn_string}
    except HTTPException:
         raise
    except Exception as e:
        print(f"Error converting FEN to PGN: {e}")
        raise HTTPException(status_code=500, detail=f"Error converting FEN: {str(e)}")


# --- Uvicorn Runner ---
if __name__ == "__main__":
    import uvicorn
    # Use reload=True for development, but turn off for production
    uvicorn.run("main2:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)