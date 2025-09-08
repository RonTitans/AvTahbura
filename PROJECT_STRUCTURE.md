# Municipal Inquiry System - Project Structure

## Clean Project Structure for POC

```
municipal-inquiry-system/
│
├── public/                  # Frontend files
│   ├── index.html          # Main user interface
│   ├── admin.html          # Admin interface
│   └── integrations.html   # Integration settings UI
│
├── node_modules/           # NPM dependencies (git-ignored)
│
├── .git/                   # Git repository files
│
├── server.js               # Main Express server (1420 lines)
├── gpt-improvements.js     # AI enhancement module (557 lines)
├── package.json            # Project dependencies
├── package-lock.json       # Dependency lock file
│
├── .env                    # Environment variables (git-ignored)
├── .env.test              # Test environment template
├── .gitignore             # Git ignore configuration
│
├── clauderon-*.json        # Google service account credentials
│
├── start-server.bat        # Windows server startup script
├── restart-server.bat      # Windows server restart script
│
├── README.md              # Basic project readme
├── TECHNICAL_DOCUMENTATION.md  # Detailed technical docs
├── GPT_INTEGRATION_DOCS.md    # GPT integration guide
└── PROJECT_STRUCTURE.md       # This file

```

## Files Removed for POC
- `temp_index.txt` - Temporary file duplicate
- `server.log` - Server logs (regenerated on run)
- `public/index.html.backup` - Unnecessary backup

## Key Files for POC

### Core Application
- **server.js**: Main backend application
- **gpt-improvements.js**: AI response enhancement

### Configuration
- **.env**: Required environment variables
- **clauderon-*.json**: Google Sheets authentication

### Documentation
- **TECHNICAL_DOCUMENTATION.md**: Complete system documentation
- **README.md**: Quick start guide

### Frontend
- **public/index.html**: User interface
- **public/admin.html**: Administrative tools
- **public/integrations.html**: System configuration

## Environment Setup for POC

1. **Required Environment Variables** (.env):
   ```
   PORT=8009
   GOOGLE_APPLICATION_CREDENTIALS=./clauderon-bd2065b087b3.json
   SPREADSHEET_ID=<your-spreadsheet-id>
   OPENAI_API_KEY=sk-<your-key>
   ```

2. **Google Sheets Access**:
   - Service account must have read/write access to the spreadsheet
   - Sheet name: "Cleaned_Answers_Data"

3. **OpenAI API**:
   - Valid API key with GPT-3.5-turbo access
   - Sufficient credits for embeddings and completions

## Quick Start Commands

```bash
# Install dependencies
npm install

# Start the server
npm start
# or on Windows:
start-server.bat

# Access the system
http://localhost:8009
```

## System URLs
- Main Interface: http://localhost:8009
- Admin Panel: http://localhost:8009/admin.html
- Integrations: http://localhost:8009/integrations.html
- Health Check: http://localhost:8009/health
- Analytics: http://localhost:8009/analytics