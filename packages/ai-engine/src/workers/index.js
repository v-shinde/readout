require('dotenv').config({ path: '../../.env' });
// Start all workers
require('./summarize.worker');
require('./profile-compute.worker');
require('./trending.worker');
require('./vectorize.worker');
console.log('[ai-engine] All workers started');
