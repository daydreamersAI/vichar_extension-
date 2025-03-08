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

from auth_db import (
    get_user_by_email, 
    users_collection, 
    create_jwt_token, 
    get_current_active_user,
    User, 
    UserInDB, 
    Token
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