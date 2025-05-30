import React, {memo, useCallback, useState, useEffect} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Alert, {AlertType} from '@jetbrains/ring-ui-built/components/alert/alert';
import Link from '@jetbrains/ring-ui-built/components/link/link';
import {ControlsHeight} from '@jetbrains/ring-ui-built/components/global/controls-height';

// Type definitions for API responses
interface AuthStatus {
  isAuthenticated: boolean;
  hasRefreshToken: boolean;
  hasAccessToken: boolean;
  accessTokenValid: boolean;
  tokenExpiresIn: number;
}

interface AuthUrlResponse {
  authUrl?: string;
  error?: string;
}

interface ExchangeCodeResponse {
  success: boolean;
  message?: string;
  error?: string;
}

interface RefreshTokenResponse {
  success: boolean;
  message?: string;
  error?: string;
  expiresAt?: string;
}

// Status type that maps to Ring UI Alert types
interface StatusMessage {
  type: 'success' | 'error' | 'info';
  message: string;
}

// Register widget in YouTrack
const host = await YTApp.register();

const AppComponent: React.FunctionComponent = () => {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [authCode, setAuthCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);

  // OPTION 1: Use type assertion (simplest quick fix)
  const getAlertType = (type: StatusMessage['type']): AlertType => {
    // Using type assertion as a workaround
    return type as any as AlertType;
  };

  // OPTION 2: If AlertType is numeric, try this approach
  // const getAlertType = (type: StatusMessage['type']): AlertType => {
  //   // Ring UI might use numeric enum values
  //   const typeMap = {
  //     'success': 0,
  //     'error': 1,
  //     'info': 2
  //   };
  //   return typeMap[type] as AlertType;
  // };

  // OPTION 3: Check if these enum members exist
  // const getAlertType = (type: StatusMessage['type']): AlertType => {
  //   switch (type) {
  //     case 'success':
  //       // Try different naming conventions: SUCCESS, Success, success
  //       return (AlertType as any).SUCCESS || (AlertType as any).Success || (AlertType as any).success;
  //     case 'error':
  //       return (AlertType as any).ERROR || (AlertType as any).Error || (AlertType as any).error;
  //     case 'info':
  //     default:
  //       return (AlertType as any).WARNING || (AlertType as any).Warning || (AlertType as any).warning || 
  //              (AlertType as any).INFO || (AlertType as any).Info || (AlertType as any).info;
  //   }
  // };

  // Check authentication status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      const result = await host.fetchApp('backend/auth-status') as AuthStatus;
      setAuthStatus(result);
      if (result.isAuthenticated) {
        const tokenStatus = result.accessTokenValid 
          ? `Token valid for ${Math.round(result.tokenExpiresIn / 60)} minutes`
          : 'Token expired, will refresh on next use';
        setStatus({type: 'success', message: `Authenticated with Google Calendar. ${tokenStatus}`});
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
    }
  }, []);

  const generateAuthUrl = useCallback(async () => {
    setLoading(true);
    try {
      const result = await host.fetchApp('backend/auth-url') as AuthUrlResponse;
      if (result.authUrl) {
        setAuthUrl(result.authUrl);
        setStatus({type: 'info', message: 'Click the link above to authorize with Google'});
      } else {
        setStatus({type: 'error', message: result.error || 'Failed to generate auth URL'});
      }
    } catch (error) {
      setStatus({type: 'error', message: 'Failed to generate auth URL'});
      console.error('Failed to generate auth URL:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const exchangeCode = useCallback(async () => {
    if (!authCode.trim()) {
      setStatus({type: 'error', message: 'Please enter the authorization code'});
      return;
    }

    setLoading(true);
    try {
      const result = await host.fetchApp('backend/exchange-code', {
        method: 'POST',
        body: {authCode: authCode.trim()}
      }) as ExchangeCodeResponse;
      
      if (result.success) {
        setStatus({type: 'success', message: 'Successfully authenticated! Refresh token saved.'});
        setAuthCode('');
        setAuthUrl('');
        checkAuthStatus(); // Refresh auth status
      } else {
        setStatus({type: 'error', message: result.error || 'Failed to exchange code'});
      }
    } catch (error) {
      setStatus({type: 'error', message: 'Failed to exchange authorization code'});
      console.error('Failed to exchange code:', error);
    } finally {
      setLoading(false);
    }
  }, [authCode, checkAuthStatus]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await host.fetchApp('backend/logout', {method: 'POST'});
      setAuthStatus(null);
      setStatus({type: 'info', message: 'Logged out successfully'});
      checkAuthStatus(); // Refresh auth status
    } catch (error) {
      setStatus({type: 'error', message: 'Failed to logout'});
      console.error('Failed to logout:', error);
    } finally {
      setLoading(false);
    }
  }, [checkAuthStatus]);

  const refreshToken = useCallback(async () => {
    setLoading(true);
    try {
      const result = await host.fetchApp('backend/refresh-token', {method: 'POST'}) as RefreshTokenResponse;
      if (result.success) {
        setStatus({type: 'success', message: 'Token refreshed successfully'});
        checkAuthStatus();
      } else {
        setStatus({type: 'error', message: result.error || 'Failed to refresh token'});
      }
    } catch (error) {
      setStatus({type: 'error', message: 'Failed to refresh token'});
      console.error('Failed to refresh token:', error);
    } finally {
      setLoading(false);
    }
  }, [checkAuthStatus]);

  return (
    <div className="widget">
      <h3>Google Calendar Authentication</h3>
      
      {status && (
        <Alert 
          type={getAlertType(status.type)}
          onCloseRequest={() => setStatus(null)}
        >
          {status.message}
        </Alert>
      )}

      {/* ALTERNATIVE: If the above doesn't work, try this simpler approach */}
      {/* {status && (
        <Alert 
          type={status.type as any}
          onCloseRequest={() => setStatus(null)}
        >
          {status.message}
        </Alert>
      )} */}

      {authStatus?.isAuthenticated ? (
        <>
          <p>You are authenticated with Google Calendar.</p>
          {authStatus.accessTokenValid && (
            <p>Access token expires in {Math.round(authStatus.tokenExpiresIn / 60)} minutes</p>
          )}
          <div style={{display: 'flex', gap: 'var(--ring-unit)'}}>
            <Button danger onClick={logout} disabled={loading}>
              Logout
            </Button>
            <Button onClick={refreshToken} disabled={loading}>
              Refresh Token
            </Button>
          </div>
        </>
      ) : (
        <>
          {!authUrl && (
            <Button primary onClick={generateAuthUrl} disabled={loading}>
              Generate Authorization URL
            </Button>
          )}

          {authUrl && (
            <>
              <div>
                <p>Click the link below to authorize with Google:</p>
                <Link href={authUrl} target="_blank">
                  Authorize Google Calendar Access
                </Link>
              </div>

              <div>
                <p>After authorization, paste the code here:</p>
                <Input
                  height={ControlsHeight.L}
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Enter authorization code"
                  disabled={loading}
                />
              </div>

              <Button primary onClick={exchangeCode} disabled={loading || !authCode}>
                Submit Code
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
};

export const App = memo(AppComponent);
