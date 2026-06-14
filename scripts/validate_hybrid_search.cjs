import('./validate_hybrid_search.js').catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
