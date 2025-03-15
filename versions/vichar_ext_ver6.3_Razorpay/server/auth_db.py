# auth_db.py
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel, EmailStr
import motor.motor_asyncio
import os
from dotenv import load_dotenv
import logging
import uuid

# Load environment variables
load_dotenv()

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# MongoDB connection
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
db = client.chess_assistant_db
users_collection = db.users
credits_collection = db.credits

# Add get_database function to ensure consistent database access
def get_database():
    """Get database connection"""
    try:
        # Return existing global database connection
        return db
    except Exception as e:
        logging.error(f"Error getting database connection: {e}")
        # If there was an error, try to reconnect
        try:
            new_client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
            return new_client.chess_assistant_db
        except Exception as reconnect_error:
            logging.error(f"Failed to reconnect to database: {reconnect_error}")
            raise

# Get password hash function
def get_password_hash(password):
    """Hash a password using bcrypt"""
    try:
        return pwd_context.hash(password)
    except Exception as e:
        logging.error(f"Error hashing password: {e}")
        raise

# JWT settings
# SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-for-jwt")
SECRET_KEY = "chess-analyzer-fixed-secret-key-for-authentication" # Hardcoded secret key for simplicity
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Models
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: str
    is_active: bool
    credits: int
    
    class Config:
        orm_mode = True

class UserInDB(User):
    hashed_password: str = None
    google_id: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class TokenData(BaseModel):
    email: Optional[str] = None

class CreditTransaction(BaseModel):
    user_id: str
    amount: int
    transaction_id: str
    transaction_date: datetime
    payment_method: str
    status: str

# Helper functions
async def get_user_by_email(email: str):
    """Get user by email from database"""
    try:
        logging.info(f"Looking up user by email: {email}")
        
        # Get database collection
        db = get_database()
        user_collection = db.users
        
        # Find user by email
        user_data = await user_collection.find_one({"email": email})
        
        if not user_data:
            logging.info(f"No user found with email: {email}")
            return None
            
        logging.info(f"User found with email: {email}")
        return create_user_from_db_doc(user_data)
    except Exception as e:
        logging.error(f"Error getting user by email: {e}")
        return None

async def get_user_by_id(user_id: str):
    user = await users_collection.find_one({"id": user_id})
    if user:
        return UserInDB(**user)
    return None

def create_jwt_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def add_credits(user_id: str, amount: int, transaction_id: str, payment_method: str):
    # Update user's credit balance
    await users_collection.update_one(
        {"id": user_id},
        {"$inc": {"credits": amount}}
    )
    
    # Record the transaction
    transaction = {
        "user_id": user_id,
        "amount": amount,
        "transaction_id": transaction_id,
        "transaction_date": datetime.utcnow(),
        "payment_method": payment_method,
        "status": "completed"
    }
    await credits_collection.insert_one(transaction)
    
    # Return updated user
    return await get_user_by_id(user_id)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = TokenData(email=email)
    except JWTError:
        raise credentials_exception
    user = await get_user_by_email(token_data.email)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: UserInDB = Depends(get_current_user)):
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# Credit check middleware
async def verify_credits(user: UserInDB = Depends(get_current_active_user)):
    if user.credits <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits. Please add credits to continue using the service."
        )
    return user

# Add helper function to safely convert MongoDB user document to UserInDB
def create_user_from_db_doc(user_doc):
    """Convert MongoDB document to UserInDB safely"""
    if not user_doc:
        return None
        
    try:
        # Handle the ID field correctly
        # MongoDB might return _id as ObjectId, so we need to convert it to string
        user_id = user_doc.get("id")
        
        # If id is not present, try _id and convert to string if it's an ObjectId
        if not user_id:
            _id = user_doc.get("_id")
            if _id:
                # Check if it's an ObjectId that needs conversion
                if hasattr(_id, "__str__"):
                    user_id = str(_id)
                else:
                    user_id = _id
            else:
                # Generate a unique ID if neither id nor _id is present
                user_id = str(uuid.uuid4())

        # Make sure required fields exist to avoid errors
        user_dict = {
            "id": user_id,
            "email": user_doc.get("email", ""),
            "full_name": user_doc.get("full_name", ""),
            "is_active": user_doc.get("is_active", True),
            "credits": user_doc.get("credits", 0),
            "hashed_password": user_doc.get("hashed_password", ""),
            "google_id": user_doc.get("google_id", None)
        }
        
        # Log the constructed user dictionary for debugging
        logging.debug(f"Created user dict: {user_dict}")
        
        return UserInDB(**user_dict)
    except Exception as e:
        logging.error(f"Error creating user from DB document: {e}")
        logging.debug(f"User document: {user_doc}")
        return None

# Update get_user_by_username function
async def get_user_by_username(username: str):
    """Get user by username from database"""
    try:
        logging.info(f"Looking up user by username: {username}")
        
        # Get database
        db = get_database()
        user_collection = db.users
        
        # First try exact username match
        user_data = await user_collection.find_one({"username": username})
        
        # If not found, try email as fallback
        if not user_data:
            logging.info(f"No user found with username, trying email: {username}")
            user_data = await user_collection.find_one({"email": username})
            
        if not user_data:
            logging.info(f"No user found with username or email: {username}")
            return None
            
        logging.info(f"User found for username: {username}")
        return create_user_from_db_doc(user_data)
    except Exception as e:
        logging.error(f"Error getting user by username: {e}")
        return None