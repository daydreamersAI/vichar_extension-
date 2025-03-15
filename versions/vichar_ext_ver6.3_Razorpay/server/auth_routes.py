# auth_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import JSONResponse, RedirectResponse
import httpx
import json
import uuid
from pydantic import BaseModel
from datetime import datetime, timedelta
import os
from typing import Optional
import bcrypt
import logging

from auth_db import (
    get_user_by_email, 
    get_user_by_username,
    users_collection, 
    create_jwt_token, 
    get_current_active_user,
    User, 
    UserInDB, 
    Token,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_database,
    create_user_from_db_doc
)

router = APIRouter(tags=["authentication"])

# Google OAuth2 config
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "https://api.beekayprecision.com/auth/google/callback")

# Models for token exchange
class GoogleTokenRequest(BaseModel):
    code: str
    redirect_uri: Optional[str] = None

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# Add the new username/password login model
class UserLogin(BaseModel):
    username: str
    password: str

# Add UserCreate model if not already defined
class UserCreate(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None

# Add password hashing functions
def get_password_hash(password: str):
    """Create hashed password"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

async def verify_password(plain_password: str, hashed_password: str):
    """Verify the password against the hashed version"""
    try:
        logging.info("Verifying password")
        
        if not hashed_password:
            logging.warning("No hashed password provided for verification")
            return False
            
        if not plain_password:
            logging.warning("No plain password provided for verification")
            return False
        
        # Check if the stored password is already hashed with bcrypt
        # bcrypt hashes start with $2b$ or similar
        if hashed_password.startswith(('$2a$', '$2b$', '$2y$')):
            logging.info("Using bcrypt for password verification")
            try:
                # Ensure we're working with bytes
                plain_bytes = plain_password.encode() if isinstance(plain_password, str) else plain_password
                hashed_bytes = hashed_password.encode() if isinstance(hashed_password, str) else hashed_password
                
                result = bcrypt.checkpw(plain_bytes, hashed_bytes)
                logging.info(f"Password verification result: {result}")
                return result
            except Exception as e:
                logging.error(f"bcrypt verification error: {str(e)}")
                # Fall through to plain text comparison if bcrypt fails
        
        # Fallback to plain text comparison (UNSAFE! only for testing)
        logging.warning("Falling back to plain text password comparison (UNSAFE)")
        result = plain_password == hashed_password
        logging.info(f"Plain text password comparison result: {result}")
        return result
    except Exception as e:
        logging.error(f"Password verification error: {str(e)}")
        return False

@router.get("/login/google")
async def login_google():
    """Generate Google login URL"""
    return {
        "url": f"https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id={GOOGLE_CLIENT_ID}&redirect_uri={GOOGLE_REDIRECT_URI}&scope=openid%20email%20profile&access_type=offline&prompt=consent"
    }

# Update the /auth/google/callback route in your auth_routes.py 

@router.get("/google/callback")
async def google_callback(code: str, request: Request):
    """Handle Google callback and create user if not exists"""
    try:
        # Exchange code for token
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code"
        }
        
        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)
            
        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to retrieve token: {token_response.text}"
            )
            
        token_json = token_response.json()
        id_token = token_json.get("id_token")
        
        # Get user info
        async with httpx.AsyncClient() as client:
            user_info_response = await client.get(
                "https://www.googleapis.com/oauth2/v1/userinfo",
                headers={"Authorization": f"Bearer {token_json['access_token']}"}
            )
            
        if user_info_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to retrieve user info: {user_info_response.text}"
            )
            
        user_info = user_info_response.json()
        
        # Check if user exists in database
        email = user_info.get("email")
        existing_user = await get_user_by_email(email)
        
        if not existing_user:
            # Create new user
            new_user = {
                "id": str(uuid.uuid4()),
                "email": email,
                "full_name": user_info.get("name", ""),
                "google_id": user_info.get("id"),
                "is_active": True,
                "credits": 5,  # Give 5 free credits to new users
                "created_at": datetime.utcnow()
            }
            await users_collection.insert_one(new_user)
            user = UserInDB(**new_user)
        else:
            # Update existing user if needed
            user = existing_user
            
        # Create access token
        access_token_expires = timedelta(minutes=1440)  # 24 hours
        access_token = create_jwt_token(
            data={"sub": user.email},
            expires_delta=access_token_expires
        )
        
        # Return token for extension to save
        user_data = User(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            credits=user.credits
        )
        
        token_response = Token(
            access_token=access_token,
            token_type="bearer",
            user=user_data
        )
        
        # Return confirmation page with token
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authentication Successful</title>
            <style>
                body {{ font-family: Arial, sans-serif; text-align: center; padding: 50px; }}
                .success {{ color: green; }}
                .container {{ max-width: 600px; margin: 0 auto; }}
            </style>
            <script>
                // Parse and store token data for the extension to find
                const tokenData = {json.dumps(token_response.dict())};
                
                // Store token in both formats for compatibility
                localStorage.setItem('chess_assistant_token', JSON.stringify(tokenData));
                
                // Also store in the auth format expected by the extension
                localStorage.setItem('chess_assistant_auth', JSON.stringify({{
                  isAuthenticated: true,
                  token: tokenData.access_token,
                  user: tokenData.user
                }}));
                
                // Create a hidden element with token data
                window.onload = function() {{
                    // Create a hidden element with the token data
                    const tokenElement = document.createElement('div');
                    tokenElement.id = 'token-data';
                    tokenElement.textContent = JSON.stringify(tokenData);
                    tokenElement.style.display = 'none';
                    document.body.appendChild(tokenElement);
                    
                    // Try to send message to extension via chrome runtime
                    try {{
                        if (window.chrome && chrome.runtime) {{
                            chrome.runtime.sendMessage({{
                                action: 'auth_updated',
                                data: {{
                                    token: tokenData.access_token,
                                    user: tokenData.user
                                }}
                            }}, response => {{
                                console.log('Extension notification response:', response);
                            }});
                        }}
                    }} catch (e) {{
                        console.log('Direct messaging to extension failed (expected):', e);
                    }}
                    
                    // Auto-close after delay
                    setTimeout(() => {{
                        if (window.opener) {{
                            window.close();
                        }}
                    }}, 3000);
                }};
            </script>
        </head>
        <body>
            <div class="container">
                <h1 class="success">Authentication Successful!</h1>
                <p id="status-message">You have successfully logged in to Chess Assistant.</p>
                <p>You can now close this window and return to the extension.</p>
                <p>Your credits: <strong>{user.credits}</strong></p>
            </div>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content, status_code=200)
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during authentication: {str(e)}"
        )

@router.post("/exchange-token", response_model=Token)
async def exchange_google_token(token_request: GoogleTokenRequest):
    """Exchange Google auth code for access token (for extension)"""
    try:
        # Exchange code for token
        token_url = "https://oauth2.googleapis.com/token"
        redirect_uri = token_request.redirect_uri or GOOGLE_REDIRECT_URI
        
        token_data = {
            "code": token_request.code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }
        
        async with httpx.AsyncClient() as client:
            token_response = await client.post(token_url, data=token_data)
            
        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to retrieve token: {token_response.text}"
            )
            
        token_json = token_response.json()
        
        # Get user info
        async with httpx.AsyncClient() as client:
            user_info_response = await client.get(
                "https://www.googleapis.com/oauth2/v1/userinfo",
                headers={"Authorization": f"Bearer {token_json['access_token']}"}
            )
            
        user_info = user_info_response.json()
        
        # Check if user exists
        email = user_info.get("email")
        existing_user = await get_user_by_email(email)
        
        if not existing_user:
            # Create new user
            new_user = {
                "id": str(uuid.uuid4()),
                "email": email,
                "full_name": user_info.get("name", ""),
                "google_id": user_info.get("id"),
                "is_active": True,
                "credits": 5,  # Free credits for new users
                "created_at": datetime.utcnow()
            }
            await users_collection.insert_one(new_user)
            user = UserInDB(**new_user)
        else:
            user = existing_user
            
        # Create JWT token
        access_token_expires = timedelta(minutes=1440)  # 24 hours
        access_token = create_jwt_token(
            data={"sub": user.email},
            expires_delta=access_token_expires
        )
        
        # Return our app's token
        user_data = User(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            credits=user.credits
        )
        
        return Token(
            access_token=access_token,
            token_type="bearer",
            user=user_data
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error exchanging token: {str(e)}"
        )

@router.get("/me", response_model=User)
async def read_users_me(current_user: UserInDB = Depends(get_current_active_user)):
    """Get current user info"""
    return User(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        is_active=current_user.is_active,
        credits=current_user.credits
    )

from fastapi.responses import HTMLResponse

@router.get("/login-page")
async def login_page():
    """Serve a login page for the extension"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Chess Assistant Login</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: #f5f5f5;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }
            .login-container {
                background-color: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                padding: 30px;
                width: 400px;
                text-align: center;
            }
            h1 {
                color: #333;
                margin-bottom: 30px;
            }
            .btn {
                display: inline-flex;
                align-items: center;
                background-color: #4285F4;
                color: white;
                padding: 10px 20px;
                border-radius: 4px;
                text-decoration: none;
                font-weight: 500;
                margin-top: 20px;
                border: none;
                cursor: pointer;
                transition: background-color 0.3s;
            }
            .btn:hover {
                background-color: #3367d6;
            }
            .google-icon {
                margin-right: 10px;
                width: 24px;
                height: 24px;
            }
            .footer {
                margin-top: 40px;
                color: #666;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="login-container">
            <h1>Chess Position Analyzer</h1>
            <p>Sign in to access advanced chess analysis with AI</p>
            
            <a href="/auth/login/google" class="btn">
                <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google" class="google-icon">
                Sign in with Google
            </a>
            
            <div class="footer">
                <p>By signing in, you agree to our Terms of Service and Privacy Policy.</p>
                <p>New users receive 5 free credits!</p>
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content, status_code=200)

# Add a username/password login endpoint
@router.post("/login", response_model=Token)
async def login_username_password(user_data: UserLogin):
    """
    Login using username and password to get access token
    """
    try:
        logging.info(f"Login attempt for username: {user_data.username}")
        
        # Get database connection
        db = get_database()
        user_collection = db.users
        
        # Try to find the user by email first
        logging.info(f"Looking up user by email: {user_data.username}")
        user_doc = await user_collection.find_one({"email": user_data.username})
        
        # If not found by email, try by username field
        if not user_doc:
            logging.info(f"User not found by email, trying username lookup")
            user_doc = await user_collection.find_one({"username": user_data.username})
            
        if not user_doc:
            logging.warning(f"Login failed: user not found for {user_data.username}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Convert the user document to UserInDB object
        try:
            user = create_user_from_db_doc(user_doc)
            if not user:
                raise ValueError("Failed to create user object from database document")
                
            logging.info(f"User found: {user.email}, verifying password")
        except Exception as user_error:
            logging.error(f"Error creating user object: {str(user_error)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error processing user data",
            )
            
        # Verify password with better error handling
        try:
            is_password_valid = await verify_password(user_data.password, user.hashed_password)
            
            if not is_password_valid:
                logging.warning(f"Login failed: invalid password for {user_data.username}")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid username or password",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except HTTPException:
            raise
        except Exception as pwd_error:
            logging.error(f"Error verifying password: {str(pwd_error)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error verifying credentials",
            )
            
        # Create access token
        try:
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_jwt_token(
                data={"sub": user.email}, expires_delta=access_token_expires
            )
            logging.info(f"Access token generated for user: {user.email}")
        except Exception as token_error:
            logging.error(f"Error creating token: {str(token_error)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error generating authentication token: {str(token_error)}"
            )
        
        logging.info(f"Login successful for {user.email}")
        
        # Format user for response
        user_response = {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name or "",
            "is_active": user.is_active,
            "credits": user.credits
        }
        
        # Return the token and user info
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response
        }
    except HTTPException as http_ex:
        # Re-raise HTTP exceptions with logging
        logging.error(f"HTTP Exception during login: {http_ex.detail}", exc_info=True)
        raise
    except Exception as e:
        logging.error(f"Login error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during login: {str(e)}",
        )

# Add signup endpoint
@router.post("/signup", response_model=Token)
async def signup(user_data: UserCreate):
    """
    Register a new user and return access token
    """
    try:
        logging.info(f"Signup attempt for email: {user_data.email}")
        
        # Check if user already exists - with additional debugging
        logging.info(f"Checking if email already exists: {user_data.email}")
        db = get_database()
        user_collection = db.users
        
        # Direct database query instead of using helper function
        existing_user_data = await user_collection.find_one({"email": user_data.email})
        if existing_user_data:
            logging.warning(f"Signup failed: Email already registered: {user_data.email}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Hash the password
        try:
            logging.info(f"Hashing password for user: {user_data.email}")
            hashed_password = get_password_hash(user_data.password)
            logging.info(f"Password hashed successfully for {user_data.email}")
        except Exception as e:
            logging.error(f"Error hashing password: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creating user: password hashing failed"
            )
        
        # Generate unique user ID
        user_id = str(uuid.uuid4())
        logging.info(f"Generated user ID: {user_id}")
        
        # Create user object with current timestamp
        current_time = datetime.utcnow()
        logging.info(f"Creating user with timestamp: {current_time}")
        
        new_user = {
            "id": user_id,
            "email": user_data.email,
            "full_name": user_data.full_name or "",
            "hashed_password": hashed_password,
            "is_active": True,
            "credits": 10,  # Starting credits
            "created_at": current_time
        }
        
        # Insert into database with direct error handling
        try:
            logging.info(f"Inserting new user into database: {user_data.email}")
            result = await user_collection.insert_one(new_user)
            inserted_id = result.inserted_id
            logging.info(f"User successfully inserted with ObjectId: {inserted_id}")
            
            if not inserted_id:
                logging.error(f"Failed to insert user into database, no inserted_id returned")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Error creating user in database"
                )
        except Exception as db_error:
            logging.error(f"Database error during user creation: {str(db_error)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error creating user in database: {str(db_error)}"
            )
        
        # Create access token
        try:
            logging.info(f"Generating access token for user: {user_data.email}")
            access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            access_token = create_jwt_token(
                data={"sub": user_data.email}, expires_delta=access_token_expires
            )
            logging.info(f"Access token generated successfully for user: {user_data.email}")
        except Exception as token_error:
            logging.error(f"Error creating token: {str(token_error)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error generating authentication token: {str(token_error)}"
            )
        
        # Format user for response
        user_response = {
            "id": user_id,
            "email": user_data.email,
            "full_name": user_data.full_name or "",
            "is_active": True,
            "credits": 10
        }
        
        logging.info(f"Signup successful for: {user_data.email}")
        
        # Return the token and user data
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": user_response
        }
    except HTTPException as http_ex:
        # Re-raise HTTP exceptions with logging
        logging.error(f"HTTP Exception during signup: {http_ex.detail}", exc_info=True)
        raise
    except Exception as e:
        logging.error(f"Unhandled signup error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error during signup: {str(e)}"
        )