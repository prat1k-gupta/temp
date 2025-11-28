#!/bin/bash

# Magic Flow AI Setup Script
# This script helps you set up AI features in 30 seconds

echo "🚀 Magic Flow - AI Setup"
echo "========================"
echo ""

# Check if .env.local exists
if [ -f ".env.local" ]; then
    echo "✅ .env.local already exists"
    
    # Check if OPENAI_API_KEY is set
    if grep -q "OPENAI_API_KEY=" .env.local; then
        echo "✅ OPENAI_API_KEY is configured"
        echo ""
        echo "All set! Restart your dev server if you haven't already:"
        echo "  npm run dev"
    else
        echo "⚠️  OPENAI_API_KEY not found in .env.local"
        echo ""
        echo "Please add this line to .env.local:"
        echo "  OPENAI_API_KEY=sk-your-key-here"
    fi
else
    echo "📝 Creating .env.local file..."
    cat > .env.local << 'EOF'
# Magic Flow Environment Variables

# OpenAI API Key (Required for AI features)
# Get your key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-your-openai-api-key-here

# After adding your key, restart your dev server:
# npm run dev
EOF
    
    echo "✅ Created .env.local"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Get an API key from: https://platform.openai.com/api-keys"
    echo "  2. Edit .env.local and replace 'sk-your-openai-api-key-here' with your real key"
    echo "  3. Restart your dev server: npm run dev"
    echo "  4. Try the AI features in any Question node!"
fi

echo ""
echo "📚 Need help? See SETUP_AI.md"

