import React, {memo, useCallback, useEffect, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Alert, {AlertType} from '@jetbrains/ring-ui-built/components/alert/alert';

// Register widget in YouTrack
const host = await YTApp.register();

interface OAuthUrlResponse {
  authUrl?: string;
  error?: string;
}

interface TokenResponse {
  success?: boolean;
  error?: string;
}

const AppComponent: React.FunctionComponent = () => {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [authCode, setAuthCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{type: AlertType, text: string} | null>(null);

  // Fetch OAuth URL on component mount
  useEffect(() => {
    const fetchAuthUrl = async () => {
      try {
        console.log('Fetching OAuth authorization URL...');
	const result = await host.fetchApp('backend/oauth/url', {}) as OAuthUrlResponse;
	if (result.authUrl) {
	  console.log('OAuth URL received successfully');
	  setAuthUrl(result.authUrl);
	} else if (result.error) {
	  console.error('Failed to get OAuth URL:', result.error);
	  setMessage({type: AlertType.ERROR, text: result.error});
	}
      } catch (error) {
        console.error('Error fetching OAuth URL:', error);
        setMessage({type: AlertType.ERROR, text: 'Failed to get authorization URL'});
      }
    };
    fetchAuthUrl();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!authCode.trim()) {
      setMessage({type: AlertType.ERROR, text: 'Please enter the authorization code'});
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const result = await host.fetchApp('backend/oauth/token', {
        method: 'POST',
        body: { code: authCode }
      }) as TokenResponse;

      // console.log(result);

      if (result.success) {
        console.log('Authorization successful!');
        setMessage({type: AlertType.SUCCESS, text: 'Authorization successful! You can now use Google Calendar sync.'});
        setAuthCode('');
      } else if (result.error) {
        console.error('Authorization failed:', result.error);
        setMessage({type: AlertType.ERROR, text: result.error});
      }
    } catch (error) {
      console.error('Failed to exchange authorization code:', error);
      setMessage({type: AlertType.ERROR, text: 'Failed to exchange authorization code'});
    } finally {
      setLoading(false);
    }
  }, [authCode]);

  return (
    <div className="widget">
      <h3>Google Calendar Authorization</h3>
      
      {message && (
        <Alert type={message.type} closeable onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {authUrl && (
        <div>
          <p>To authorize Google Calendar access:</p>
          <ol>
            <li>Click the link below to log in to Google</li>
            <li>Grant calendar permissions</li>
            <li>Copy the authorization code from the success page</li>
            <li>Paste it below and click Submit</li>
          </ol>
          
          <div style={{marginBottom: '16px'}}>
            <a href={authUrl} target="_blank" rel="noopener noreferrer">
              Authorize Google Calendar Access
            </a>
          </div>
        </div>
      )}

      <div style={{marginBottom: '16px'}}>
        <Input
          placeholder="Paste authorization code here"
          value={authCode}
          onChange={(e) => setAuthCode(e.target.value)}
          disabled={loading}
        />
      </div>

      <Button 
        primary 
        onClick={handleSubmit} 
        disabled={loading || !authCode.trim()}
        loader={loading}
      >
        Submit Authorization Code
      </Button>
    </div>
  );
};

export const App = memo(AppComponent);
