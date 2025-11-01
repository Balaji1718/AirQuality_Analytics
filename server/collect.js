#!/usr/bin/env node

/**
 * Standalone Data Collection Script
 * Used by GitHub Actions for automatic data collection
 */

require('dotenv').config();

// Import the autoFetchAndStore function from the main server file
const path = require('path');
const serverPath = path.join(__dirname, 'index.js');

async function runDataCollection() {
  console.log('🚀 Starting automatic data collection via GitHub Actions...');
  console.log('📅 Timestamp:', new Date().toISOString());
  
  try {
    // Dynamically import the function to avoid starting the entire server
    const { autoFetchAndStore } = require('./index.js');
    
    if (!autoFetchAndStore) {
      throw new Error('autoFetchAndStore function not found in index.js');
    }
    
    console.log('🔄 Calling autoFetchAndStore function...');
    const result = await autoFetchAndStore();
    
    console.log('✅ Data collection completed successfully!');
    console.log('📊 Result:', JSON.stringify(result, null, 2));
    
    // Exit successfully
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Data collection failed:');
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Exit with error code
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the collection
runDataCollection();