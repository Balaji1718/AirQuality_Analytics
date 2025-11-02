#!/bin/bash

# Render.com deployment build script for Air Quality Analytics

echo "🚀 Starting Render.com deployment build..."

# Set environment
export NODE_ENV=production

# Install server dependencies
echo "📦 Installing server dependencies..."
cd server
npm install --production
cd ..

# Install client dependencies and build
echo "📦 Installing client dependencies..."
cd client
npm install
echo "🏗️  Building React application..."
npm run build
cd ..

# Copy client build to server for serving
echo "📋 Setting up static file serving..."
if [ -d "server/public" ]; then
    rm -rf server/public
fi
cp -r client/build server/public

echo "✅ Build completed successfully!"
echo "🎉 Ready for deployment on Render.com"