@echo off
cd /d F:\ClaudeCode\projects\municipal-inquiry-system
echo Starting Municipal Inquiry System...
start /min cmd /c "node server.js > server.log 2>&1"
echo Server started in background. Check server.log for output.
echo The server will be available at http://localhost:8009 after embeddings are generated.
echo This may take several minutes due to 4515 entries being processed.