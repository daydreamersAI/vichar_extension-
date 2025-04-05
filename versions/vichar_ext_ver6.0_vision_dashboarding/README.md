# Chess Analysis Extension

A Chrome extension that provides AI-powered analysis for chess positions on popular chess websites.

## Features

- Analyze chess positions from Lichess.org and Chess.com
- Get AI-powered insights and suggestions
- Capture board positions for detailed analysis
- User authentication with MongoDB
- Save and retrieve your analysis history

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Add your OpenAI API key
   - Configure MongoDB connection string (already set up with a working connection)
   - Set JWT secret key

4. Run the API server:
   ```
   uvicorn apis.api_analysis:app --reload
   ```

5. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension directory

## MongoDB Setup

This extension uses MongoDB for user authentication. The connection is already configured with a working MongoDB Atlas cluster.

The database structure is:
- Database: `chess_assistant_db`
- Collections:
  - `users` - Stores user information (email, password, name)

### Creating Test Users

To create test users with plain text passwords (for development only), run:

```
python create_test_user.py
```

This will create the following test users:
- Email: test@example.com, Password: password123
- Email: alice@example.com, Password: alice123
- Email: bob@example.com, Password: bob123

### Fixing "malformed bcrypt hash" Error

If you encounter a "malformed bcrypt hash" error when logging in, it means the passwords in your MongoDB database are not properly hashed. The API has been updated to handle plain text passwords as a fallback, but for production use, you should properly hash all passwords.

To fix this issue:
1. Run the `create_test_user.py` script to create users with plain text passwords
2. Use these test users to log in
3. For production, update the API to properly hash passwords using bcrypt

## Authentication Flow

1. Users must log in to use the extension features
2. The login form accepts email and password
3. Authentication is handled via JWT tokens
4. MongoDB is used to store user credentials securely

## API Endpoints

- `/register` - Register a new user
- `/login` - Login existing user
- `/analysis` - Analyze chess position

## Development

To build the extension for development:

1. Make your changes
2. Test the extension locally
3. Update the version in `manifest.json`

## License

MIT 