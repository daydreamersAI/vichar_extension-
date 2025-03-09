from pymongo import MongoClient
from datetime import datetime
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection
MONGODB_URI = os.getenv("MONGODB_URL", "mongodb://localhost:27017/")

try:
    # Connect to MongoDB
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    
    # Test connection
    client.admin.command('ping')
    print("MongoDB connection successful!")
    
    # Access the database and collection
    db = client["chess_assistant_db"]
    users_collection = db["users"]
    
    # Test user with plain text password
    test_user = {
        "email": "test@example.com",
        "password": "password123",  # Plain text password for testing
        "name": "Test User",
        "created_at": datetime.utcnow()
    }
    
    # Check if user already exists
    existing_user = users_collection.find_one({"email": test_user["email"]})
    if existing_user:
        print(f"User {test_user['email']} already exists. Updating password to plain text...")
        # Update the user's password to plain text
        users_collection.update_one(
            {"email": test_user["email"]},
            {"$set": {"password": test_user["password"]}}
        )
        print(f"Updated user {test_user['email']} with plain text password")
    else:
        # Insert the test user
        result = users_collection.insert_one(test_user)
        print(f"Created test user {test_user['email']} with ID: {result.inserted_id}")
    
    # Add more test users
    additional_users = [
        {
            "email": "alice@example.com",
            "password": "alice123",
            "name": "Alice Smith"
        },
        {
            "email": "bob@example.com",
            "password": "bob123",
            "name": "Bob Johnson"
        }
    ]
    
    for user in additional_users:
        # Check if user already exists
        existing_user = users_collection.find_one({"email": user["email"]})
        if existing_user:
            print(f"User {user['email']} already exists. Updating password to plain text...")
            # Update the user's password to plain text
            users_collection.update_one(
                {"email": user["email"]},
                {"$set": {"password": user["password"]}}
            )
            print(f"Updated user {user['email']} with plain text password")
        else:
            # Add created_at timestamp
            user["created_at"] = datetime.utcnow()
            # Insert the user
            result = users_collection.insert_one(user)
            print(f"Created user {user['email']} with ID: {result.inserted_id}")
    
    # List all users in the collection
    print("\nUsers in the database:")
    for user in users_collection.find():
        print(f"- {user['email']} ({user['name']})")
    
    print("\nTest users created/updated successfully!")

except Exception as e:
    print(f"Error: {e}") 