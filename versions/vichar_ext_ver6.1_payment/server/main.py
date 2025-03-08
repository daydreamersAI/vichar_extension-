# main.py (Full Implementation)
from fastapi import FastAPI, Depends, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
import os
from dotenv import load_dotenv
import json

# Import original code
from apis.api_analysis import app as original_app
from apis.api_analysis import analyze_position

# Import new authentication and payment modules
from auth_db import get_current_active_user, verify_credits, UserInDB, users_collection
from auth_routes import router as auth_router
from payment_routes import router as payment_router

# Load environment variables
load_dotenv()

# Create a new FastAPI app
app = FastAPI(title="Chess Assistant API with Authentication")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the original app under the /chess path
# This allows us to keep all the existing functionality
app.mount("/chess", original_app)

# Include the authentication and payment routers
app.include_router(auth_router, prefix="/auth", tags=["authentication"])
app.include_router(payment_router, prefix="/payments", tags=["payments"])

# Root endpoint
@app.get("/")
async def root():
    """API root endpoint"""
    return {
        "message": "Chess Assistant API is running",
        "auth_endpoints": [
            "/auth/login/google",
            "/auth/me"
        ],
        "payment_endpoints": [
            "/payments/credits/packages",
            "/payments/create-order",
            "/payments/payment-page"
        ],
        "analysis_endpoint": "/analysis",
        "chess_endpoints": "/chess/*"
    }

# Create new protected analysis endpoint
@app.post("/analysis-with-credit", tags=["analysis"])
async def analyze_with_credit_deduction(
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: UserInDB = Depends(verify_credits)
):
    """
    Analysis endpoint that deducts a credit after successful analysis.
    Uses background tasks to update the credit count after response is sent.
    """
    try:
        # Get the JSON body
        body = await request.json()
        
        # Call the original analysis function
        result = await analyze_position(body)
        
        # Add background task to deduct credit
        background_tasks.add_task(deduct_credit, current_user.id)
        
        # Add user info to the response
        result["user"] = {
            "id": current_user.id,
            "email": current_user.email,
            "credits_remaining": current_user.credits - 1  # Show updated count in response
        }
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error analyzing position: {str(e)}"
        )

async def deduct_credit(user_id: str):
    """Deduct one credit from the user account"""
    try:
        result = await users_collection.update_one(
            {"id": user_id},
            {"$inc": {"credits": -1}}
        )
        
        # Log the result
        print(f"Credit deduction for user {user_id}: {result.modified_count} document updated")
    except Exception as e:
        print(f"Error deducting credit from user {user_id}: {str(e)}")

# Status and health check endpoint
@app.get("/health", tags=["system"])
async def health_check():
    """Health check endpoint for monitoring"""
    return {
        "status": "ok",
        "version": "1.0.0",
        "services": {
            "api": "healthy",
            "database": "connected"  # You could add actual DB connection check here
        }
    }

# Documentation page for developers
@app.get("/docs-custom", tags=["system"])
async def custom_docs():
    """Custom documentation page"""
    html_content = """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Chess Assistant API Documentation</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                line-height: 1.6;
            }
            h1, h2, h3 {
                color: #333;
            }
            .endpoint {
                background-color: #f5f5f5;
                padding: 15px;
                border-radius: 5px;
                margin-bottom: 20px;
            }
            .method {
                font-weight: bold;
                color: #0066cc;
            }
            pre {
                background-color: #f9f9f9;
                padding: 10px;
                border-radius: 3px;
                overflow-x: auto;
            }
            .note {
                background-color: #fffde7;
                padding: 10px;
                border-left: 4px solid #ffd600;
                margin: 15px 0;
            }
        </style>
    </head>
    <body>
        <h1>Chess Assistant API Documentation</h1>
        <p>This API provides chess position analysis with authentication and payment features.</p>
        
        <h2>Authentication Endpoints</h2>
        
        <div class="endpoint">
            <p class="method">GET /auth/login/google</p>
            <p>Initiates the Google OAuth login flow.</p>
        </div>
        
        <div class="endpoint">
            <p class="method">GET /auth/me</p>
            <p>Returns the current user's information.</p>
            <p>Requires authentication token in Authorization header.</p>
        </div>
        
        <h2>Payment Endpoints</h2>
        
        <div class="endpoint">
            <p class="method">GET /payments/credits/packages</p>
            <p>Returns available credit packages.</p>
            <p>Requires authentication token in Authorization header.</p>
        </div>
        
        <div class="endpoint">
            <p class="method">POST /payments/create-order</p>
            <p>Creates a payment order for credits.</p>
            <p>Requires authentication token in Authorization header.</p>
        </div>
        
        <h2>Analysis Endpoints</h2>
        
        <div class="endpoint">
            <p class="method">POST /analysis-with-credit</p>
            <p>Analyzes a chess position and deducts one credit.</p>
            <p>Requires authentication token in Authorization header.</p>
        </div>
        
        <div class="endpoint">
            <p class="method">POST /chess/analysis</p>
            <p>Legacy analysis endpoint without authentication.</p>
        </div>
        
        <div class="note">
            <p>Note: For complete OpenAPI documentation, visit <a href="/docs">/docs</a>.</p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content, status_code=200)

# Error handling for common scenarios
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Custom error handler for HTTP exceptions"""
    return {
        "error": True,
        "message": exc.detail,
        "status_code": exc.status_code,
        "type": "http_exception"
    }

# Add generic error handler
@app.exception_handler(Exception)
async def generic_exception_handler(request, exc):
    """Generic error handler for all other exceptions"""
    return {
        "error": True,
        "message": str(exc),
        "status_code": 500,
        "type": "server_error"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)