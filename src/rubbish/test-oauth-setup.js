const entities = require('@jetbrains/youtrack-scripting-api/entities');

// Test workflow to verify OAuth setup
// Create an issue with summary "Test OAuth" to trigger this workflow

exports.rule = entities.Issue.onChange({
  title: 'Test OAuth Setup',
  guard: (ctx) => {
    const issue = ctx.issue;
    return issue.becomesReported && issue.summary.toLowerCase().includes('test oauth');
  },
  action: async (ctx) => {
    const issue = ctx.issue;
    const currentUser = ctx.currentUser;
    const userProps = currentUser.extensionProperties;
    
    console.log('=== OAuth Setup Test ===');
    
    // Check app settings
    const hasClientId = !!ctx.settings.clientId;
    const hasClientSecret = !!ctx.settings.clientSecret;
    
    console.log('App Settings:');
    console.log('- CLIENT_ID configured:', hasClientId);
    console.log('- CLIENT_SECRET configured:', hasClientSecret);
    
    // Check user authentication
    console.log('\nUser Authentication:');
    console.log('- User:', currentUser.login);
    console.log('- Has refresh token:', !!userProps.googleRefreshToken);
    console.log('- Has access token:', !!userProps.googleAccessToken);
    console.log('- Token expiry:', userProps.googleTokenExpiry ? new Date(userProps.googleTokenExpiry) : 'Not set');
    
    // Build status report
    let report = '## OAuth Setup Test Results\n\n';
    report += '### App Configuration\n';
    report += `- CLIENT_ID: ${hasClientId ? '✓ Configured' : '✗ Missing'}\n`;
    report += `- CLIENT_SECRET: ${hasClientSecret ? '✓ Configured' : '✗ Missing'}\n\n`;
    
    report += '### User Authentication\n';
    report += `- User: ${currentUser.login}\n`;
    report += `- Refresh Token: ${userProps.googleRefreshToken ? '✓ Present' : '✗ Missing'}\n`;
    report += `- Access Token: ${userProps.googleAccessToken ? '✓ Present' : '✗ Missing'}\n`;
    
    if (userProps.googleTokenExpiry) {
      const expiryDate = new Date(userProps.googleTokenExpiry);
      const isExpired = expiryDate < new Date();
      report += `- Token Status: ${isExpired ? '⚠ Expired' : '✓ Valid'}\n`;
      report += `- Expires: ${expiryDate.toISOString()}\n`;
    } else {
      report += `- Token Status: ✗ No expiry set\n`;
    }
    
    report += '\n### Next Steps\n';
    if (!hasClientId || !hasClientSecret) {
      report += '1. Admin needs to configure CLIENT_ID and CLIENT_SECRET in app settings\n';
    }
    if (!userProps.googleRefreshToken) {
      report += '2. User needs to authenticate via the widget\n';
    } else if (userProps.googleTokenExpiry && new Date(userProps.googleTokenExpiry) < new Date()) {
      report += '2. Access token expired - will refresh automatically on next use\n';
    } else {
      report += '✓ Setup complete! Ready to sync with Google Calendar.\n';
    }
    
    // Try to load helpers
    try {
      const helpers = require('./calendar-sync-helpers-app');
      report += '\n### Helper Module\n';
      report += '✓ calendar-sync-helpers-app.js loaded successfully\n';
      
      // Test token refresh if authenticated
      if (userProps.googleRefreshToken && hasClientId && hasClientSecret) {
        try {
          console.log('Testing token refresh...');
          const token = helpers.getAccessToken(ctx);
          report += '✓ Token refresh successful\n';
        } catch (error) {
          report += `✗ Token refresh failed: ${error.message}\n`;
        }
      }
    } catch (error) {
      report += '\n### Helper Module\n';
      report += `✗ Failed to load helper module: ${error.message}\n`;
    }
    
    // Add report as comment
    issue.addComment(report);
    console.log('Test complete - check issue comments for detailed report');
  },
  requirements: {}
});
