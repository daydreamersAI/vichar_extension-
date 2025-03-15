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

# # Add CORS middleware to allow requests from browser extensions
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # Adjust this in production to be more specific
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# MongoDB connection with error handling
try:
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)  # 5 second timeout
    # Test connection
    client.admin.command('ping')
    print("MongoDB connection successful!")
    db = client["chess_assistant_db"]  # Use the database name from the connection string
    users_collection = db["users"]
    subscriptions_collection = db["subscriptions"]  # Add subscriptions collection
    
    # Create indexes for users collection if they don't exist
    if "email_1" not in users_collection.index_information():
        users_collection.create_index("email", unique=True)
        print("Created email index")
    
    # Create indexes for subscriptions collection if they don't exist
    if "user_id_1" not in subscriptions_collection.index_information():
        subscriptions_collection.create_index("user_id", unique=True)
        print("Created user_id index for subscriptions")
    
    MONGODB_ENABLED = True
except Exception as e:
    print(f"MongoDB connection failed: {e}")
    MONGODB_ENABLED = False
    # Fallback to in-memory user store
    fallback_users = {}
    fallback_subscriptions = {}

class Message(BaseModel):
    text: str
    sender: str

class ChessAnalysisRequest(BaseModel):
    message: str
    fen: Optional[str] = None
    pgn: Optional[str] = None
    image_data: Optional[str] = None  # Base64 encoded image data
    chat_history: Optional[List[Message]] = []

class ChessAnalysisResponse(BaseModel):
    response: str

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
    plan: str  # 'premium'
    interval: str  # 'monthly' or 'yearly'

class CreditPurchaseCreate(BaseModel):
    package: str  # 'basic', 'standard', or 'premium'

class PaymentVerification(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

# Helper functions for authentication
def verify_password(plain_password, hashed_password):
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        print(f"Password verification error: {e}")
        # If there's an error with the hash, fall back to plain text comparison
        # This is not secure but allows for temporary functionality
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

@app.get("/")
async def root():
    return {"message": "Chess Assistant API is running", "mongodb_enabled": MONGODB_ENABLED}

@app.post("/register", response_model=Token)
async def register_user(user: UserCreate):
    if MONGODB_ENABLED:
        try:
            # Check if user already exists
            existing_user = users_collection.find_one({"email": user.email})
            if existing_user:
                raise HTTPException(status_code=400, detail="Email already registered")
            
            # Store password as plain text temporarily for testing
            # In production, you should use hashed_password = get_password_hash(user.password)
            password_to_store = user.password
            
            # Create new user
            new_user = {
                "email": user.email,
                "password": password_to_store,
                "name": user.name,
                "created_at": datetime.utcnow()
            }
            
            # Insert into database
            result = users_collection.insert_one(new_user)
            user_id = str(result.inserted_id)
            
            # Create a free subscription for the user
            new_subscription = {
                "user_id": user_id,
                "status": "free",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            subscriptions_collection.insert_one(new_subscription)
            
            # Create access token
            access_token = create_access_token({"sub": user_id, "email": user.email})
            
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user_id": user_id,
                "name": user.name
            }
        except Exception as e:
            print(f"MongoDB registration error: {e}")
            raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")
    else:
        # Fallback to in-memory storage
        if user.email in fallback_users:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Store user with plain password (not secure, but simple for fallback)
        user_id = f"user_{len(fallback_users) + 1}"
        fallback_users[user.email] = {
            "id": user_id,
            "email": user.email,
            "password": user.password,  # Store plain password
            "name": user.name
        }
        
        # Create a free subscription for the user
        fallback_subscriptions[user_id] = {
            "user_id": user_id,
            "status": "free",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        # Create access token
        access_token = create_access_token({"sub": user_id, "email": user.email})
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user_id": user_id,
            "name": user.name
        }

@app.post("/login", response_model=Token)
async def login_user(user: UserLogin):
    if MONGODB_ENABLED:
        try:
            # Find user by email
            db_user = users_collection.find_one({"email": user.email})
            if not db_user:
                raise HTTPException(status_code=401, detail="Invalid email or password")
            
            # Check if password is stored as plain text or hashed
            stored_password = db_user["password"]
            password_matches = False
            
            # First try direct comparison (for plain text passwords)
            if stored_password == user.password:
                password_matches = True
            else:
                # Try bcrypt verification if direct comparison fails
                try:
                    password_matches = verify_password(user.password, stored_password)
                except Exception as e:
                    print(f"Password verification error: {e}")
                    password_matches = False
            
            if not password_matches:
                raise HTTPException(status_code=401, detail="Invalid email or password")
            
            # Create access token
            user_id = str(db_user["_id"])
            access_token = create_access_token({"sub": user_id, "email": user.email})
            
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user_id": user_id,
                "name": db_user["name"]
            }
        except HTTPException:
            raise
        except Exception as e:
            print(f"MongoDB login error: {e}")
            raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
    else:
        # Fallback to in-memory storage
        if user.email in fallback_users and fallback_users[user.email]["password"] == user.password:
            fallback_user = fallback_users[user.email]
            access_token = create_access_token({"sub": fallback_user["id"], "email": user.email})
            
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user_id": fallback_user["id"],
                "name": fallback_user["name"]
            }
        
        # If we get here, authentication failed
        raise HTTPException(status_code=401, detail="Invalid email or password")

async def get_current_user(token: str = Depends(oauth2_scheme)):
    if not token:
        return None
        
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        email = payload.get("email")
        
        if not user_id:
            return None
            
        if MONGODB_ENABLED:
            try:
                from bson.objectid import ObjectId
                user = users_collection.find_one({"_id": ObjectId(user_id)})
                if user:
                    # Add the id as a string field for easier access
                    user["id"] = str(user["_id"])
                    return user
            except Exception as e:
                print(f"Error retrieving user: {e}")
                pass
                
        # Fallback to in-memory storage
        if not MONGODB_ENABLED and email in fallback_users and fallback_users[email]["id"] == user_id:
            return fallback_users[email]
            
    except Exception as e:
        print(f"Token validation error: {e}")
        return None
        
    return None

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
        
        # Determine if we should use vision model based on image availability
        use_vision = request.image_data is not None and len(request.image_data) > 0
        
        # Call the appropriate LLM API based on whether we have an image
        if use_vision:
            response = call_vision_api(request.message, request.image_data, request.fen, game_analysis, chat_context)
        else:
            # Prepare the prompt for the regular LLM
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

def call_vision_api(user_message: str, image_data: str, fen: Optional[str], game_analysis: str, chat_context: str) -> str:
    """
    Call GPT-4o Vision API with image and message.
    """
    if not OPENAI_API_KEY:
        return "I'm unable to analyze this position right now. Please check your API configuration."
    
    try:
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        }
        
        # Format the system message with FEN and game information if available
        system_message = "You are a chess assistant that provides helpful analysis based on chess board images."
        
        if fen or game_analysis:
            system_message += "\n\nAdditional chess information:\n"
            if fen:
                system_message += f"FEN: {fen}\n"
            if game_analysis:
                system_message += f"{game_analysis}\n"
        
        # Add chat context if available
        if chat_context:
            system_message += f"\nPrevious conversation:\n{chat_context}"
        
        # Clean the base64 string if needed
        if image_data.startswith("data:image"):
            # Extract the actual base64 content
            image_data = image_data.split(",")[1]
        
        # Construct the payload for GPT-4o Vision
        payload = {
            "model": "gpt-4o",  # Use GPT-4o for vision capabilities
            "messages": [
                {
                    "role": "system",
                    "content": system_message
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": f"Here is a chess board image. Please analyze it based on this request: {user_message}"
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_data}"
                            }
                        }
                    ]
                }
            ],
            "temperature": 0.7,
            "max_tokens": 1000
        }
        
        # Call the OpenAI API
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json=payload
        )
        
        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            print(f"Vision API Error: {response.status_code} - {response.text}")
            return f"Sorry, I encountered an error while analyzing the image. Status code: {response.status_code}"
    
    except Exception as e:
        print(f"Error calling Vision API: {str(e)}")
        return f"I'm having trouble analyzing the chess board image: {str(e)}"

def verify_razorpay_signature(order_id, payment_id, signature):
    """Verify the Razorpay signature to ensure payment is valid"""
    # Generate the signature verification string
    msg = f"{order_id}|{payment_id}"
    
    # Generate a HMAC-SHA256 signature
    generated_signature = hmac.new(
        key=RAZORPAY_KEY_SECRET.encode(),
        msg=msg.encode(),
        digestmod=hashlib.sha256
    ).hexdigest()
    
    # Verify if the signatures match
    return hmac.compare_digest(generated_signature, signature)

# Razorpay Configuration
RAZORPAY_KEY_ID = "rzp_test_JB7DxS1VpotPXc"  # Replace with your actual key
RAZORPAY_KEY_SECRET = "YJx0bpKe6D3JQuVyNZv6jACy"  # Replace with your actual secret
client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# Subscription Plans
SUBSCRIPTION_PLANS = {
    "premium": {
        "monthly": {
            "amount": 49900,  # ₹499 in paise
            "currency": "INR",
            "interval": "monthly",
            "description": "Premium Monthly Subscription"
        },
        "yearly": {
            "amount": 499900,  # ₹4999 in paise
            "currency": "INR", 
            "interval": "yearly",
            "description": "Premium Yearly Subscription"
        }
    }
}

# Credit Packages
CREDIT_PACKAGES = {
    "basic": {
        "amount": 100,  # $1.00 in cents
        "currency": "USD", 
        "credits": 1000,
        "description": "Basic Package - 1,000 Credits"
    },
    "standard": {
        "amount": 450,  # $4.50 in cents
        "currency": "USD",
        "credits": 5000,
        "description": "Standard Package - 5,000 Credits"
    },
    "premium": {
        "amount": 1000,  # $10.00 in cents
        "currency": "USD",
        "credits": 12000,
        "description": "Premium Package - 12,000 Credits" 
    }
}

@app.post("/subscription/verify-payment")
async def verify_payment(
    payment: PaymentVerification,
    current_user = Depends(get_current_user)
):
    """Verify the Razorpay payment and activate subscription"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
        
    # Verify the payment signature
    if not verify_razorpay_signature(
        payment.razorpay_order_id, 
        payment.razorpay_payment_id, 
        payment.razorpay_signature
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid payment signature"
        )
    
    try:
        # Fetch payment details from Razorpay
        payment_details = client.payment.fetch(payment.razorpay_payment_id)
        
        # Verify payment is successful
        if payment_details['status'] != 'captured':
            raise HTTPException(
                status_code=400,
                detail="Payment not captured"
            )
        
        # Fetch order details
        order_details = client.order.fetch(payment.razorpay_order_id)
        
        # Get subscription details from order notes
        order_user_id = order_details['notes']['user_id']
        plan = order_details['notes']['plan']
        interval = order_details['notes']['interval']
        
        # Verify user_id matches current user
        if order_user_id != current_user["id"]:
            raise HTTPException(
                status_code=403,
                detail="User ID mismatch"
            )
        
        # Calculate subscription end date
        if interval == 'monthly':
            end_date = datetime.utcnow() + timedelta(days=30)
        elif interval == 'yearly':
            end_date = datetime.utcnow() + timedelta(days=365)
        else:
            end_date = datetime.utcnow() + timedelta(days=30)  # Default to monthly
        
        # Update subscription in database
        if MONGODB_ENABLED:
            from bson.objectid import ObjectId
            subscription = subscriptions_collection.find_one({"user_id": current_user["id"]})
            
            if not subscription:
                # Create new subscription if it doesn't exist
                new_subscription = {
                    "user_id": current_user["id"],
                    "status": "premium",
                    "start_date": datetime.utcnow(),
                    "end_date": end_date,
                    "razorpay_payment_id": payment.razorpay_payment_id,
                    "razorpay_order_id": payment.razorpay_order_id,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                subscriptions_collection.insert_one(new_subscription)
            else:
                # Update existing subscription
                subscriptions_collection.update_one(
                    {"user_id": current_user["id"]},
                    {
                        "$set": {
                            "status": "premium",
                            "start_date": datetime.utcnow(),
                            "end_date": end_date,
                            "razorpay_payment_id": payment.razorpay_payment_id,
                            "razorpay_order_id": payment.razorpay_order_id,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
        else:
            # For fallback in-memory storage
            fallback_subscriptions[current_user["id"]] = {
                "user_id": current_user["id"],
                "status": "premium",
                "start_date": datetime.utcnow(),
                "end_date": end_date,
                "razorpay_payment_id": payment.razorpay_payment_id,
                "razorpay_order_id": payment.razorpay_order_id,
                "updated_at": datetime.utcnow()
            }
        
        return {
            "success": True,
            "status": "premium",
            "expiry": end_date.isoformat()
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create order: {str(e)}"
        )

@app.get("/subscription/manage")
async def manage_subscription(current_user = Depends(get_current_user)):
    """Redirect to subscription management page"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
        
    # In a real implementation, you might create a customer portal session
    # or provide a UI for managing subscriptions
    
    # For simplicity, just return a message
    return {
        "message": "Subscription management UI would be shown here"
    }

@app.get("/subscription/status")
async def get_subscription_status(current_user = Depends(get_current_user)):
    """Get the current user's subscription status"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
        
    if MONGODB_ENABLED:
        subscription = subscriptions_collection.find_one({"user_id": current_user["id"]})
        
        if not subscription:
            # Create a free subscription entry if none exists
            new_subscription = {
                "user_id": current_user["id"],
                "status": "free",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            subscriptions_collection.insert_one(new_subscription)
            
            return {
                "status": "free",
                "expiry": None
            }
            
        # Check if subscription is expired
        if subscription.get("status") == "premium" and subscription.get("end_date") and subscription["end_date"] < datetime.utcnow():
            # Update subscription to free status if expired
            subscriptions_collection.update_one(
                {"user_id": current_user["id"]},
                {
                    "$set": {
                        "status": "free",
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            return {
                "status": "free",
                "expiry": None
            }
            
        return {
            "status": subscription.get("status", "free"),
            "expiry": subscription.get("end_date").isoformat() if subscription.get("end_date") else None
        }
    else:
        # For fallback in-memory storage
        if current_user["id"] in fallback_subscriptions:
            subscription = fallback_subscriptions[current_user["id"]]
            
            # Check if subscription is expired
            if subscription.get("status") == "premium" and subscription.get("end_date") and subscription["end_date"] < datetime.utcnow():
                subscription["status"] = "free"
                subscription["updated_at"] = datetime.utcnow()
                
                return {
                    "status": "free",
                    "expiry": None
                }
                
            return {
                "status": subscription.get("status", "free"),
                "expiry": subscription.get("end_date").isoformat() if subscription.get("end_date") else None
            }
        else:
            # Create new subscription record
            fallback_subscriptions[current_user["id"]] = {
                "user_id": current_user["id"],
                "status": "free",
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            }
            
            return {
                "status": "free",
                "expiry": None
            }

@app.post("/subscription/create-order")
async def create_subscription_order(
    order: SubscriptionOrderCreate,
    current_user = Depends(get_current_user)
):
    """Create a new Razorpay order for subscription"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
        
    # Validate plan and interval
    if order.plan not in SUBSCRIPTION_PLANS or order.interval not in SUBSCRIPTION_PLANS[order.plan]:
        raise HTTPException(
            status_code=400,
            detail="Invalid subscription plan or interval"
        )
    
    # Get plan details
    plan = SUBSCRIPTION_PLANS[order.plan][order.interval]
    
    # Generate a receipt ID
    receipt_id = f"sub_{current_user['id']}_{int(datetime.utcnow().timestamp())}"
    
    # Create order in Razorpay
    try:
        razorpay_order = client.order.create({
            'amount': plan['amount'],
            'currency': plan['currency'],
            'receipt': receipt_id,
            'payment_capture': 1,  # Auto-capture payment
            'notes': {
                'user_id': current_user["id"],
                'plan': order.plan,
                'interval': order.interval
            }
        })
        
        # Store the order reference in database
        if MONGODB_ENABLED:
            subscription = subscriptions_collection.find_one({"user_id": current_user["id"]})
            
            if not subscription:
                # Create new subscription record if it doesn't exist
                new_subscription = {
                    "user_id": current_user["id"],
                    "status": "free",
                    "razorpay_order_id": razorpay_order['id'],
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                subscriptions_collection.insert_one(new_subscription)
            else:
                # Update existing subscription with new order ID
                subscriptions_collection.update_one(
                    {"user_id": current_user["id"]},
                    {
                        "$set": {
                            "razorpay_order_id": razorpay_order['id'],
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
        else:
            # For fallback in-memory storage
            if current_user["id"] in fallback_subscriptions:
                fallback_subscriptions[current_user["id"]]["razorpay_order_id"] = razorpay_order['id']
                fallback_subscriptions[current_user["id"]]["updated_at"] = datetime.utcnow()
            else:
                # Create new subscription record
                fallback_subscriptions[current_user["id"]] = {
                    "user_id": current_user["id"],
                    "status": "free",
                    "razorpay_order_id": razorpay_order['id'],
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
        
        # Return order details to client
        return {
            "razorpay_key_id": RAZORPAY_KEY_ID,
            "razorpay_order_id": razorpay_order['id'],
            "amount": plan['amount'],
            "currency": plan['currency'],
            "description": plan['description']
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create order: {str(e)}"
        )

@app.post("/credits/create-order")
async def create_credit_order(
    order: CreditPurchaseCreate,
    current_user = Depends(get_current_user)
):
    """Create a new Razorpay order for credit purchase"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
        
    # Validate package
    if order.package not in CREDIT_PACKAGES:
        raise HTTPException(
            status_code=400,
            detail="Invalid credit package"
        )
    
    # Get package details
    package = CREDIT_PACKAGES[order.package]
    
    # Generate a receipt ID
    receipt_id = f"cred_{current_user['id']}_{int(datetime.utcnow().timestamp())}"
    
    # Create order in Razorpay
    try:
        razorpay_order = client.order.create({
            'amount': package['amount'],
            'currency': package['currency'],
            'receipt': receipt_id,
            'payment_capture': 1,  # Auto-capture payment
            'notes': {
                'user_id': current_user["id"],
                'type': 'credits',
                'package': order.package,
                'credits': package['credits']
            }
        })
        
        # Store the order reference in database
        if MONGODB_ENABLED:
            # Create credits collection if needed
            if 'credits' not in db.list_collection_names():
                credits_collection = db.create_collection("credits")
                credits_collection.create_index("user_id")
            else:
                credits_collection = db["credits"]
            
            # Store order reference
            credits_collection.insert_one({
                "user_id": current_user["id"],
                "razorpay_order_id": razorpay_order['id'],
                "package": order.package,
                "credits": package['credits'],
                "status": "pending",
                "created_at": datetime.utcnow()
            })
        
        # Return order details to client
        return {
            "razorpay_key_id": RAZORPAY_KEY_ID,
            "razorpay_order_id": razorpay_order['id'],
            "amount": package['amount'],
            "currency": package['currency'],
            "description": package['description'],
            "credits": package['credits']
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create order: {str(e)}"
        )

@app.post("/credits/verify-payment")
async def verify_credit_payment(
    payment: PaymentVerification,
    current_user = Depends(get_current_user)
):
    """Verify the Razorpay payment for credits and add credits to user account"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
        
    # Verify the payment signature
    if not verify_razorpay_signature(
        payment.razorpay_order_id, 
        payment.razorpay_payment_id, 
        payment.razorpay_signature
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid payment signature"
        )
    
    try:
        # Fetch payment details from Razorpay
        payment_details = client.payment.fetch(payment.razorpay_payment_id)
        
        # Verify payment is successful
        if payment_details['status'] != 'captured':
            raise HTTPException(
                status_code=400,
                detail="Payment not captured"
            )
        
        # Fetch order details
        order_details = client.order.fetch(payment.razorpay_order_id)
        
        # Get order details from notes
        order_user_id = order_details['notes']['user_id']
        order_type = order_details['notes'].get('type')
        
        # Only process if it's a credits order
        if order_type != 'credits':
            raise HTTPException(
                status_code=400,
                detail="Not a credits order"
            )
        
        # Verify user_id matches current user
        if order_user_id != current_user["id"]:
            raise HTTPException(
                status_code=403,
                detail="User ID mismatch"
            )
        
        # Get credits from order
        credits_to_add = int(order_details['notes']['credits'])
        
        # Update credits in database
        if MONGODB_ENABLED:
            # Get credits collection
            credits_collection = db["credits"]
            
            # Update order status
            credits_collection.update_one(
                {"razorpay_order_id": payment.razorpay_order_id},
                {
                    "$set": {
                        "status": "completed",
                        "razorpay_payment_id": payment.razorpay_payment_id,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Get user's current credits
            user_credits = credits_collection.find_one(
                {"user_id": current_user["id"], "type": "balance"}
            )
            
            if user_credits:
                # Update existing balance
                new_balance = user_credits.get("balance", 0) + credits_to_add
                credits_collection.update_one(
                    {"user_id": current_user["id"], "type": "balance"},
                    {
                        "$set": {
                            "balance": new_balance,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
            else:
                # Create new balance record
                credits_collection.insert_one({
                    "user_id": current_user["id"],
                    "type": "balance",
                    "balance": credits_to_add,
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                })
            
            # Get updated balance
            updated_credits = credits_collection.find_one(
                {"user_id": current_user["id"], "type": "balance"}
            )
            current_balance = updated_credits.get("balance", credits_to_add)
        else:
            # Simple in-memory implementation
            if "credits" not in globals():
                globals()["credits"] = {}
            
            if current_user["id"] not in globals()["credits"]:
                globals()["credits"][current_user["id"]] = credits_to_add
            else:
                globals()["credits"][current_user["id"]] += credits_to_add
            
            current_balance = globals()["credits"][current_user["id"]]
        
        return {
            "success": True,
            "credits_added": credits_to_add,
            "current_balance": current_balance
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process credit payment: {str(e)}"
        )

@app.get("/credits/balance")
async def get_credit_balance(current_user = Depends(get_current_user)):
    """Get the current user's credit balance"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    
    try:
        if MONGODB_ENABLED:
            # Get credits collection
            if 'credits' not in db.list_collection_names():
                # No credits collection yet, return 0
                return {"balance": 0}
            
            credits_collection = db["credits"]
            
            # Get user's current balance
            user_credits = credits_collection.find_one(
                {"user_id": current_user["id"], "type": "balance"}
            )
            
            if user_credits:
                return {"balance": user_credits.get("balance", 0)}
            else:
                return {"balance": 0}
        else:
            # Simple in-memory implementation
            if "credits" not in globals():
                globals()["credits"] = {}
            
            return {"balance": globals()["credits"].get(current_user["id"], 0)}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch credit balance: {str(e)}"
        )

@app.post("/credits/use")
async def use_credits(
    request: Dict[str, int],
    current_user = Depends(get_current_user)
):
    """Use credits for analysis"""
    if not current_user:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )
    
    # Get amount to use
    amount = request.get("amount", 1)
    if amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid credit amount"
        )
    
    try:
        if MONGODB_ENABLED:
            # Get credits collection
            if 'credits' not in db.list_collection_names():
                # No credits collection yet
                raise HTTPException(
                    status_code=400,
                    detail="Insufficient credits"
                )
            
            credits_collection = db["credits"]
            
            # Get user's current balance
            user_credits = credits_collection.find_one(
                {"user_id": current_user["id"], "type": "balance"}
            )
            
            if not user_credits or user_credits.get("balance", 0) < amount:
                raise HTTPException(
                    status_code=400,
                    detail="Insufficient credits"
                )
            
            # Update balance
            new_balance = user_credits["balance"] - amount
            credits_collection.update_one(
                {"user_id": current_user["id"], "type": "balance"},
                {
                    "$set": {
                        "balance": new_balance,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            # Log usage
            credits_collection.insert_one({
                "user_id": current_user["id"],
                "type": "usage",
                "amount": amount,
                "created_at": datetime.utcnow()
            })
            
            return {
                "success": True,
                "credits_used": amount,
                "current_balance": new_balance
            }
        else:
            # Simple in-memory implementation
            if "credits" not in globals():
                globals()["credits"] = {}
            
            if current_user["id"] not in globals()["credits"] or globals()["credits"][current_user["id"]] < amount:
                raise HTTPException(
                    status_code=400,
                    detail="Insufficient credits"
                )
            
            globals()["credits"][current_user["id"]] -= amount
            
            return {
                "success": True,
                "credits_used": amount,
                "current_balance": globals()["credits"][current_user["id"]]
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to use credits: {str(e)}"
        )

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