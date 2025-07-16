const fetch = require('node-fetch');

// Configuration
const API_BASE_URL = 'http://localhost:3001';
const TEST_CREDENTIALS = {
  email: 'maman01437@yandex.com',
  password: 'User123@'
};

// Performance tracking
const performanceResults = {
  login: [],
  getProfile: [],
  updateProfile: [],
  summary: {}
};

// Helper function to measure time
function measureTime(label, fn) {
  const start = process.hrtime.bigint();
  return fn().then(result => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    console.log(`${label}: ${duration.toFixed(2)}ms`);
    return { result, duration };
  });
}

// Login to get authentication token
async function login() {
  console.log('🔐 Testing Login Performance...');
  
  const { result, duration } = await measureTime('Login API Call', async () => {
    const response = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(TEST_CREDENTIALS)
    });
    
    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }
    
    return response.json();
  });
  
  performanceResults.login.push(duration);
  return result.token;
}

// Test GET profile performance
async function testGetProfile(token) {
  console.log('\n📖 Testing GET Profile Performance...');
  
  for (let i = 0; i < 5; i++) {
    const { result, duration } = await measureTime(`GET Profile (Run ${i + 1})`, async () => {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`GET Profile failed: ${response.status}`);
      }
      
      return response.json();
    });
    
    performanceResults.getProfile.push(duration);
    
    // Add small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Test PUT profile performance
async function testUpdateProfile(token) {
  console.log('\n✏️ Testing PUT Profile Performance...');
  
  const updateData = {
    username: 'testuser' + Date.now(),
    fullName: 'Test User Performance',
    email: 'test@performance.com',
    phone: '1234567890',
    bio: 'Performance testing bio',
    longBio: 'This is a longer bio for performance testing purposes. '.repeat(10),
    address: '123 Performance Test Street',
    profileJson: { testField: 'performance test value' }
  };
  
  for (let i = 0; i < 3; i++) {
    const { result, duration } = await measureTime(`PUT Profile (Run ${i + 1})`, async () => {
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...updateData,
          username: updateData.username + i // Make username unique
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PUT Profile failed: ${response.status} - ${errorText}`);
      }
      
      return response.json();
    });
    
    performanceResults.updateProfile.push(duration);
    
    // Add small delay between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// Calculate statistics
function calculateStats(measurements) {
  if (measurements.length === 0) return null;
  
  const sorted = measurements.sort((a, b) => a - b);
  const sum = measurements.reduce((a, b) => a + b, 0);
  
  return {
    count: measurements.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    average: sum / measurements.length,
    median: sorted[Math.floor(sorted.length / 2)],
    total: sum
  };
}

// Generate performance report
function generateReport() {
  console.log('\n📊 Generating Performance Report...');
  
  performanceResults.summary = {
    login: calculateStats(performanceResults.login),
    getProfile: calculateStats(performanceResults.getProfile),
    updateProfile: calculateStats(performanceResults.updateProfile),
    timestamp: new Date().toISOString(),
    testConditions: {
      apiBaseUrl: API_BASE_URL,
      nodeVersion: process.version,
      platform: process.platform
    }
  };
  
  return performanceResults;
}

// Main test function
async function runPerformanceTests() {
  console.log('🚀 Starting Profile API Performance Tests\n');
  console.log('=' * 50);
  
  try {
    // Login first
    const token = await login();
    
    // Test GET profile
    await testGetProfile(token);
    
    // Test PUT profile
    await testUpdateProfile(token);
    
    // Generate report
    const report = generateReport();
    
    console.log('\n✅ Performance tests completed successfully!');
    return report;
    
  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    throw error;
  }
}

// Run tests and save results
if (require.main === module) {
  runPerformanceTests()
    .then(report => {
      console.log('\n📝 Saving performance report...');
      const fs = require('fs');
      const reportContent = JSON.stringify(report, null, 2);
      
      // Save detailed JSON report
      fs.writeFileSync('./performance-report.json', reportContent);
      
      // Save human-readable report
      const readableReport = `
# Profile API Performance Test Report
Generated: ${report.summary.timestamp}

## Test Environment
- API Base URL: ${report.summary.testConditions.apiBaseUrl}
- Node.js Version: ${report.summary.testConditions.nodeVersion}
- Platform: ${report.summary.testConditions.platform}

## Performance Results

### Login API
- Tests Run: ${report.summary.login?.count || 0}
- Average: ${report.summary.login?.average?.toFixed(2) || 'N/A'}ms
- Min: ${report.summary.login?.min?.toFixed(2) || 'N/A'}ms
- Max: ${report.summary.login?.max?.toFixed(2) || 'N/A'}ms
- Median: ${report.summary.login?.median?.toFixed(2) || 'N/A'}ms

### GET Profile API
- Tests Run: ${report.summary.getProfile?.count || 0}
- Average: ${report.summary.getProfile?.average?.toFixed(2) || 'N/A'}ms
- Min: ${report.summary.getProfile?.min?.toFixed(2) || 'N/A'}ms
- Max: ${report.summary.getProfile?.max?.toFixed(2) || 'N/A'}ms
- Median: ${report.summary.getProfile?.median?.toFixed(2) || 'N/A'}ms

### PUT Profile API
- Tests Run: ${report.summary.updateProfile?.count || 0}
- Average: ${report.summary.updateProfile?.average?.toFixed(2) || 'N/A'}ms
- Min: ${report.summary.updateProfile?.min?.toFixed(2) || 'N/A'}ms
- Max: ${report.summary.updateProfile?.max?.toFixed(2) || 'N/A'}ms
- Median: ${report.summary.updateProfile?.median?.toFixed(2) || 'N/A'}ms

## Performance Analysis

### Current Issues Identified
1. **Complex JOIN Queries**: The current implementation uses multiple LEFT JOINs and subqueries
2. **Unnecessary Data Fetching**: Fetching counts that may not always be needed
3. **No Query Optimization**: Missing database indexing recommendations
4. **Redundant Queries**: Separate queries for update and then select after update

### Recommendations for Optimization
1. **Optimize Database Queries**: Use single optimized queries instead of multiple joins
2. **Implement Query Caching**: Cache frequently accessed data
3. **Add Database Indexes**: Ensure proper indexing on frequently queried columns
4. **Use Connection Pooling**: Optimize database connection management
5. **Implement Response Caching**: Cache user profile data for short periods

## Raw Performance Data
\`\`\`json
${reportContent}
\`\`\`
`;
      
      fs.writeFileSync('./PERFORMANCE_REPORT.md', readableReport);
      
      console.log('✅ Performance report saved to:');
      console.log('  - performance-report.json (detailed data)');
      console.log('  - PERFORMANCE_REPORT.md (human-readable)');
      
    })
    .catch(error => {
      console.error('💥 Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = { runPerformanceTests };
