#!/bin/bash

echo "🔄 Rebuilding index with all rows..."

# Build full index without embeddings for speed
curl -X POST "https://municipal-inquiry-system-git-dev-titans4.vercel.app/api/rag-refresh?limit=10000&skipEmbeddings=true" \
  -H "Content-Type: application/json"

echo ""
echo "✅ Index rebuild triggered"