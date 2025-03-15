# payment_routes.py - Integrate with your main.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import razorpay
import hmac
import hashlib
import os
from datetime import datetime

# Import your authentication dependencies
from auth_db import get_current_active_user, UserInDB, users_collection

# Create router
router = APIRouter()

# Initialize Razorpay client - get these from your environment variables
RAZORPAY_KEY_ID = "rzp_test_JB7DxS1VpotPXc"
RAZORPAY_KEY_SECRET = "YJx0bpKe6D3JQuVyNZv6jACy"

# Initialize Razorpay client
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# Models
class CreditPackage(BaseModel):
    id: str
    name: str
    credits: int
    amount: int  # In smallest currency unit (paise for INR)
    currency: str = "INR"
    description: Optional[str] = None

class OrderRequest(BaseModel):
    amount: int
    currency: str = "INR"
    packageId: str
    credits: int
    receipt: Optional[str] = None

class PaymentVerificationRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str
    packageId: str
    credits: int

# Define credit packages
CREDIT_PACKAGES = [
    CreditPackage(
        id="basic",
        name="Basic",
        credits=50,
        amount=29900,  # ₹299
        description="Entry level package with 50 credits"
    ),
    CreditPackage(
        id="standard",
        name="Standard",
        credits=120,
        amount=59900,  # ₹599
        description="Most popular package with 120 credits"
    ),
    CreditPackage(
        id="premium",
        name="Premium",
        credits=300,
        amount=99900,  # ₹999
        description="Premium package with 300 credits"
    )
]

# Get available credit packages
@router.get("/credits/packages", response_model=List[CreditPackage])
async def get_credit_packages(current_user: UserInDB = Depends(get_current_active_user)):
    """
    Get available credit packages for purchase
    """
    return CREDIT_PACKAGES

# Create Razorpay payment order
@router.post("/create-order")
async def create_payment_order(
    order_request: OrderRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """
    Create a Razorpay order for credit purchase
    """
    try:
        # Validate the package
        package = next((pkg for pkg in CREDIT_PACKAGES if pkg.id == order_request.packageId), None)
        if not package:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid package ID"
            )
        
        # Create receipt ID if not provided
        receipt = order_request.receipt or f"chess_credits_{current_user.id}_{datetime.now().timestamp()}"
        
        # Create the Razorpay order
        order_data = {
            "amount": order_request.amount,
            "currency": order_request.currency,
            "receipt": receipt,
            "notes": {
                "user_id": current_user.id,
                "package_id": order_request.packageId,
                "credits": order_request.credits,
                "email": current_user.email
            }
        }
        
        order = razorpay_client.order.create(data=order_data)
        
        # Store the order in your database if needed
        # await store_order(order, current_user.id)
        
        return order
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating order: {str(e)}"
        )

# Verify Razorpay payment
@router.post("/verify-payment")
async def verify_payment(
    verification: PaymentVerificationRequest,
    current_user: UserInDB = Depends(get_current_active_user)
):
    """
    Verify a Razorpay payment and add credits to user account
    """
    try:
        # Create parameter dict for signature verification
        params_dict = {
            'razorpay_order_id': verification.razorpay_order_id,
            'razorpay_payment_id': verification.razorpay_payment_id,
            'razorpay_signature': verification.razorpay_signature
        }
        
        # Verify the payment signature
        try:
            razorpay_client.utility.verify_payment_signature(params_dict)
            signature_valid = True
        except:
            signature_valid = False
            
        if not signature_valid:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"verified": False, "error": "Invalid payment signature"}
            )
        
        # If signature is valid, fetch payment details
        payment = razorpay_client.payment.fetch(verification.razorpay_payment_id)
        
        # Verify payment status
        if payment['status'] != 'captured':
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"verified": False, "error": f"Payment not captured, status: {payment['status']}"}
            )
        
        # Update user credits in the database
        current_credits = current_user.credits or 0
        updated_credits = current_credits + verification.credits
        
        # Update user in database
        result = await users_collection.update_one(
            {"id": current_user.id},
            {"$set": {"credits": updated_credits}}
        )
        
        if result.modified_count == 0:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"verified": False, "error": "Failed to update user credits"}
            )
        
        # Record the transaction in your database if needed
        # await store_transaction(...)
        
        return {
            "verified": True,
            "updatedCredits": updated_credits,
            "paymentId": verification.razorpay_payment_id
        }
        
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"verified": False, "error": f"Error verifying payment: {str(e)}"}
        )

# Get payment page URL (optional - for redirecting to a payment page)
@router.get("/payment-page")
async def get_payment_page(current_user: UserInDB = Depends(get_current_active_user)):
    """
    Get the URL for the payment page
    """
    # You can customize this based on your application's needs
    return {
        "url": "/payment.html",
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "credits": current_user.credits
        }
    }