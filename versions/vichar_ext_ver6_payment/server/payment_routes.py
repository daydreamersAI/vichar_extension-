# payment_routes.py
from fastapi import APIRouter, Depends, HTTPException, status, Request, Body
from fastapi.responses import JSONResponse, RedirectResponse, HTMLResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uuid
import hmac
import hashlib
import json
import os
import time
from datetime import datetime
import httpx
from auth_db import (
    get_current_active_user,
    UserInDB, 
    User,
    add_credits
)

router = APIRouter(tags=["payments"])

# Payment gateway configuration
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
CALLBACK_URL = os.getenv("PAYMENT_CALLBACK_URL", "https://api.beekayprecision.com/payments/callback")

# Credit packages
CREDIT_PACKAGES = {
    "basic": {"amount": 199, "credits": 20, "name": "Basic Pack"},
    "standard": {"amount": 499, "credits": 60, "name": "Standard Pack"},
    "premium": {"amount": 999, "credits": 150, "name": "Premium Pack"}
}

class PaymentRequest(BaseModel):
    package_id: str
    
class PaymentCallbackRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str

class PaymentVerificationRequest(BaseModel):
    payment_id: str
    order_id: str
    
@router.get("/credits/packages")
async def get_credit_packages(current_user: UserInDB = Depends(get_current_active_user)):
    """Get available credit packages"""
    return {
        "packages": [
            {
                "id": pkg_id,
                "name": pkg["name"],
                "credits": pkg["credits"],
                "amount": pkg["amount"],
                "amount_display": f"₹{pkg['amount']}"
            }
            for pkg_id, pkg in CREDIT_PACKAGES.items()
        ],
        "current_credits": current_user.credits
    }

@router.post("/create-order")
async def create_payment_order(
    payment_request: PaymentRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Create a payment order"""
    try:
        if payment_request.package_id not in CREDIT_PACKAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid package ID"
            )
            
        package = CREDIT_PACKAGES[payment_request.package_id]
        
        # Create Razorpay order
        order_id = f"order_{uuid.uuid4().hex}"
        receipt_id = f"receipt_{uuid.uuid4().hex}"
        
        # Razorpay amount is in paise (100 paise = 1 INR)
        amount_in_paise = package["amount"] * 100
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.razorpay.com/v1/orders",
                auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
                json={
                    "amount": amount_in_paise,
                    "currency": "INR",
                    "receipt": receipt_id,
                    "payment_capture": 1,
                    "notes": {
                        "user_id": current_user.id,
                        "package_id": payment_request.package_id,
                        "credits": package["credits"]
                    }
                }
            )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create order: {response.text}"
            )
            
        order_data = response.json()
        
        return {
            "order_id": order_data["id"],
            "amount": amount_in_paise,
            "currency": "INR",
            "key_id": RAZORPAY_KEY_ID,
            "package": package,
            "user": {
                "name": current_user.full_name or "",
                "email": current_user.email
            },
            "notes": {
                "user_id": current_user.id,
                "package_id": payment_request.package_id,
                "credits": package["credits"]
            }
        }
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating payment order: {str(e)}"
        )

@router.post("/verify-payment")
async def verify_payment(
    verification: PaymentCallbackRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """Verify payment and add credits"""
    try:
        # Verify the payment signature
        msg = f"{verification.razorpay_order_id}|{verification.razorpay_payment_id}"
        generated_signature = hmac.new(
            RAZORPAY_KEY_SECRET.encode(),
            msg.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if generated_signature != verification.razorpay_signature:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payment signature"
            )
            
        # Fetch payment details from Razorpay
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.razorpay.com/v1/payments/{verification.razorpay_payment_id}",
                auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)
            )
            
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to fetch payment details: {response.text}"
            )
            
        payment_data = response.json()
        
        # Check if payment is successful
        if payment_data["status"] != "captured":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment not completed. Status: {payment_data['status']}"
            )
            
        # Extract information from the payment
        notes = payment_data.get("notes", {})
        package_id = notes.get("package_id")
        
        if not package_id or package_id not in CREDIT_PACKAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid package information in payment"
            )
            
        package = CREDIT_PACKAGES[package_id]
        credits_to_add = package["credits"]
        
        # Add credits to user account
        updated_user = await add_credits(
            user_id=current_user.id,
            amount=credits_to_add,
            transaction_id=verification.razorpay_payment_id,
            payment_method="razorpay_upi"
        )
        
        # Return success response
        return {
            "success": True,
            "message": f"Successfully added {credits_to_add} credits",
            "user": {
                "id": updated_user.id,
                "email": updated_user.email,
                "credits": updated_user.credits
            },
            "transaction": {
                "id": verification.razorpay_payment_id,
                "amount": payment_data["amount"] / 100,  # Convert back to INR
                "credits": credits_to_add
            }
        }
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error verifying payment: {str(e)}"
        )

@router.get("/payment-page")
async def payment_page(package_id: str, current_user: UserInDB = Depends(get_current_active_user)):
    """Serve a payment page for UPI payments"""
    try:
        if package_id not in CREDIT_PACKAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid package ID"
            )
            
        package = CREDIT_PACKAGES[package_id]
        
        # Create Razorpay order
        receipt_id = f"receipt_{uuid.uuid4().hex}"
        amount_in_paise = package["amount"] * 100
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.razorpay.com/v1/orders",
                auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET),
                json={
                    "amount": amount_in_paise,
                    "currency": "INR",
                    "receipt": receipt_id,
                    "payment_capture": 1,
                    "notes": {
                        "user_id": current_user.id,
                        "package_id": package_id,
                        "credits": package["credits"]
                    }
                }
            )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create order: {response.text}"
            )
            
        order_data = response.json()
        
        # Generate payment page HTML
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Chess Assistant - Add Credits</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
            <style>
                body {{
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    background-color: #f5f5f5;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }}
                .payment-container {{
                    background-color: white;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                    padding: 30px;
                    width: 400px;
                    text-align: center;
                }}
                h1 {{
                    color: #333;
                    margin-bottom: 20px;
                }}
                .package-details {{
                    background-color: #f9f9f9;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 20px;
                }}
                .price {{
                    font-size: 24px;
                    font-weight: bold;
                    color: #4285F4;
                }}
                .credits {{
                    font-size: 18px;
                    color: #34a853;
                    margin: 10px 0;
                }}
                .btn {{
                    background-color: #4285F4;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 4px;
                    text-decoration: none;
                    font-weight: 500;
                    border: none;
                    cursor: pointer;
                    transition: background-color 0.3s;
                    font-size: 16px;
                    display: inline-block;
                }}
                .btn:hover {{
                    background-color: #3367d6;
                }}
                .payment-methods {{
                    display: flex;
                    justify-content: center;
                    margin: 20px 0;
                }}
                .payment-methods img {{
                    height: 30px;
                    margin: 0 5px;
                }}
                .user-info {{
                    margin-top: 20px;
                    color: #666;
                    font-size: 14px;
                }}
            </style>
        </head>
        <body>
            <div class="payment-container">
                <h1>Add Credits</h1>
                
                <div class="package-details">
                    <h2>{package["name"]}</h2>
                    <div class="price">₹{package["amount"]}</div>
                    <div class="credits">{package["credits"]} Credits</div>
                </div>
                
                <div class="payment-methods">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/0/0f/Google_Pay_Logo.svg" alt="Google Pay">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/e/e1/PhonePe_Logo.svg" alt="PhonePe">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/2/24/Paytm_Logo_%28standalone%29.svg" alt="Paytm">
                </div>
                
                <button id="rzp-button" class="btn">Pay with UPI</button>
                
                <div class="user-info">
                    <p>Logged in as: {current_user.email}</p>
                    <p>Current Credits: {current_user.credits}</p>
                </div>
                
                <script>
                    document.getElementById('rzp-button').onclick = function(e) {{
                        var options = {{
                            "key": "{RAZORPAY_KEY_ID}", 
                            "amount": "{amount_in_paise}",
                            "currency": "INR",
                            "name": "Chess Assistant",
                            "description": "{package['name']} - {package['credits']} Credits",
                            "order_id": "{order_data['id']}",
                            "prefill": {{
                                "name": "{current_user.full_name or 'User'}",
                                "email": "{current_user.email}"
                            }},
                            "theme": {{
                                "color": "#4285F4"
                            }},
                            "handler": function (response) {{
                                // Send verification request
                                fetch('/payments/verify-payment', {{
                                    method: 'POST',
                                    headers: {{
                                        'Content-Type': 'application/json',
                                        'Authorization': 'Bearer ' + localStorage.getItem('chess_assistant_token')
                                    }},
                                    body: JSON.stringify({{
                                        razorpay_payment_id: response.razorpay_payment_id,
                                        razorpay_order_id: response.razorpay_order_id,
                                        razorpay_signature: response.razorpay_signature
                                    }})
                                }})
                                .then(response => response.json())
                                .then(data => {{
                                    if(data.success) {{
                                        // Update UI to show success
                                        document.querySelector('.payment-container').innerHTML = `
                                            <h1>Payment Successful!</h1>
                                            <div class="package-details">
                                                <div class="credits">+{package['credits']} Credits Added</div>
                                                <div>New Balance: ${{data.user.credits}} Credits</div>
                                            </div>
                                            <p>Thank you for your purchase.</p>
                                            <p>You can now close this window and return to the extension.</p>
                                        `;
                                        
                                        // Notify extension about the updated credits
                                        if (window.opener) {{
                                            window.opener.postMessage({{
                                                type: 'chess_assistant_credits_updated',
                                                data: data.user
                                            }}, '*');
                                        }}
                                    }} else {{
                                        alert('Payment verification failed. Please contact support.');
                                    }}
                                }})
                                .catch(error => {{
                                    console.error('Error:', error);
                                    alert('An error occurred during payment verification.');
                                }});
                            }}
                        }};
                        
                        var rzp1 = new Razorpay(options);
                        rzp1.open();
                        e.preventDefault();
                    }};
                </script>
            </div>
        </body>
        </html>
        """
        
        return HTMLResponse(content=html_content, status_code=200)
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating payment page: {str(e)}"
        )

@router.get("/callback")
async def payment_callback(
    razorpay_payment_id: Optional[str] = None,
    razorpay_order_id: Optional[str] = None,
    razorpay_signature: Optional[str] = None
):
    """Handle payment callback from Razorpay"""
    success = all([razorpay_payment_id, razorpay_order_id, razorpay_signature])
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{"Payment Successful" if success else "Payment Failed"}</title>
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                text-align: center;
                padding: 50px;
                background-color: #f5f5f5;
            }}
            .container {{
                max-width: 500px;
                margin: 0 auto;
                background-color: white;
                padding: 30px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }}
            .success {{ color: #34a853; }}
            .error {{ color: #ea4335; }}
            h1 {{ margin-bottom: 20px; }}
            .btn {{
                display: inline-block;
                padding: 10px 20px;
                background-color: #4285F4;
                color: white;
                text-decoration: none;
                border-radius: 4px;
                margin-top: 20px;
            }}
        </style>
        <script>
            // Try to send message to extension
            window.onload = function() {{
                if (window.opener) {{
                    window.opener.postMessage({{
                        type: 'chess_assistant_payment_status',
                        success: {str(success).lower()},
                        payment_id: "{razorpay_payment_id or ''}"
                    }}, '*');
                    setTimeout(() => window.close(), 3000);
                }}
            }};
        </script>
    </head>
    <body>
        <div class="container">
            <h1 class="{"success" if success else "error"}">{"Payment Successful!" if success else "Payment Failed"}</h1>
            <p>{"Your payment has been processed successfully. Credits have been added to your account." if success else "There was an issue with your payment. Please try again."}</p>
            <p>{"You can now return to the Chess Assistant extension." if success else "If you continue to face issues, please contact support."}</p>
            <p>{"" if not success else f"Payment ID: {razorpay_payment_id}"}</p>
            <a href="#" class="btn" onclick="window.close()">Close Window</a>
        </div>
    </body>
    </html>
    """
    
    return HTMLResponse(content=html_content, status_code=200)