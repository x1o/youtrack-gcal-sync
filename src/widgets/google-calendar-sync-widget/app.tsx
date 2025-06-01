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

interface CalendarIdResponse {
  calendarId?: string;
  error?: string;
}

interface SetCalendarIdResponse {
  success?: boolean;
  error?: string;
}

interface Calendar {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

interface CalendarListResponse {
  calendars?: Calendar[];
  error?: string;
}

interface OAuthStatusResponse {
  hasRefreshToken?: boolean;
  hasAccessToken?: boolean;
  refreshToken?: string;
  accessToken?: string;
  tokenExpiry?: number;
  isTokenExpired?: boolean;
  expiryDate?: string;
  error?: string;
}

const AppComponent: React.FunctionComponent = () => {
  const [authUrl, setAuthUrl] = useState<string>('');
  const [authCode, setAuthCode] = useState<string>('');
  const [calendarId, setCalendarId] = useState<string>('');
  const [savedCalendarId, setSavedCalendarId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [savingCalendarId, setSavingCalendarId] = useState<boolean>(false);
  const [loadingCalendars, setLoadingCalendars] = useState<boolean>(false);
  const [availableCalendars, setAvailableCalendars] = useState<Calendar[]>([]);
  const [showCalendarList, setShowCalendarList] = useState<boolean>(false);
  const [message, setMessage] = useState<{type: AlertType, text: string} | null>(null);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusResponse | null>(null);

  // Fetch OAuth URL and current calendar ID on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch OAuth URL
        console.log('Fetching OAuth authorization URL...');
        const urlResult = await host.fetchApp('backend/oauth/url', {}) as OAuthUrlResponse;
        if (urlResult.authUrl) {
          console.log('OAuth URL received successfully');
          setAuthUrl(urlResult.authUrl);
        } else if (urlResult.error) {
          console.error('Failed to get OAuth URL:', urlResult.error);
          setMessage({type: AlertType.ERROR, text: urlResult.error});
        }

        // Fetch current calendar ID
        console.log('Fetching current calendar ID...');
        const calendarResult = await host.fetchApp('backend/calendar/id', {}) as CalendarIdResponse;
        if (calendarResult.calendarId) {
          console.log('Current calendar ID:', calendarResult.calendarId);
          setSavedCalendarId(calendarResult.calendarId);
          setCalendarId(calendarResult.calendarId);
        }

        // Fetch OAuth status
        console.log('Fetching OAuth status...');
        const statusResult = await host.fetchApp('backend/oauth/status', {}) as OAuthStatusResponse;
        if (!statusResult.error) {
          console.log('OAuth status retrieved');
          setOauthStatus(statusResult);
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setMessage({type: AlertType.ERROR, text: 'Failed to load initial data'});
      }
    };
    fetchInitialData();
  }, []);

  const handleAuthSubmit = useCallback(async () => {
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

      if (result.success) {
        console.log('Authorization successful!');
        setMessage({type: AlertType.SUCCESS, text: 'Authorization successful! You can now use Google Calendar sync.'});
        setAuthCode('');
        
        // Refresh OAuth status
        try {
          const statusResult = await host.fetchApp('backend/oauth/status', {}) as OAuthStatusResponse;
          if (!statusResult.error) {
            setOauthStatus(statusResult);
          }
        } catch (error) {
          console.error('Failed to refresh OAuth status:', error);
        }
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

  const handleCalendarIdSubmit = useCallback(async () => {
    if (!calendarId.trim()) {
      setMessage({type: AlertType.ERROR, text: 'Please enter a calendar ID'});
      return;
    }

    setSavingCalendarId(true);
    setMessage(null);

    try {
      const result = await host.fetchApp('backend/calendar/id', {
        method: 'POST',
        body: { calendarId: calendarId.trim() }
      }) as SetCalendarIdResponse;

      if (result.success) {
        console.log('Calendar ID saved successfully!');
        setMessage({type: AlertType.SUCCESS, text: 'Calendar ID saved successfully!'});
        setSavedCalendarId(calendarId.trim());
      } else if (result.error) {
        console.error('Failed to save calendar ID:', result.error);
        setMessage({type: AlertType.ERROR, text: result.error});
      }
    } catch (error) {
      console.error('Failed to save calendar ID:', error);
      setMessage({type: AlertType.ERROR, text: 'Failed to save calendar ID'});
    } finally {
      setSavingCalendarId(false);
    }
  }, [calendarId]);

  const loadAvailableCalendars = useCallback(async () => {
    setLoadingCalendars(true);
    setMessage(null);

    try {
      const result = await host.fetchApp('backend/calendar/list', {}) as CalendarListResponse;

      if (result.calendars) {
        console.log('Calendars loaded:', result.calendars.length);
        setAvailableCalendars(result.calendars);
        setShowCalendarList(true);
      } else if (result.error) {
        console.error('Failed to load calendars:', result.error);
        setMessage({type: AlertType.ERROR, text: result.error});
      }
    } catch (error) {
      console.error('Failed to load calendars:', error);
      setMessage({type: AlertType.ERROR, text: 'Failed to load calendar list'});
    } finally {
      setLoadingCalendars(false);
    }
  }, []);

  const selectCalendar = useCallback((calendar: Calendar) => {
    setCalendarId(calendar.id);
    setShowCalendarList(false);
    setMessage({type: AlertType.SUCCESS, text: `Selected: ${calendar.summary}`});
  }, []);

  return (
    <div className="widget">
      <h3>Google Calendar Setup</h3>
      
      {message && (
        <Alert type={message.type} closeable onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <div style={{marginBottom: '24px'}}>
        <h4>Step 1: Google Authorization</h4>
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
          onClick={handleAuthSubmit} 
          disabled={loading || !authCode.trim()}
          loader={loading}
        >
          Submit Authorization Code
        </Button>
      </div>

      {oauthStatus && oauthStatus.hasRefreshToken && (
        <div style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          fontSize: '13px'
        }}>
          <div style={{marginBottom: '8px', fontWeight: '500'}}>OAuth Status:</div>
          <div style={{marginBottom: '4px'}}>
            <span style={{color: '#666'}}>Refresh Token:</span>{' '}
            <code style={{fontSize: '12px'}}>{oauthStatus.refreshToken || 'Not available'}</code>
          </div>
          <div style={{marginBottom: '4px'}}>
            <span style={{color: '#666'}}>Access Token:</span>{' '}
            <code style={{fontSize: '12px'}}>{oauthStatus.accessToken || 'Not available'}</code>
            {oauthStatus.isTokenExpired && (
              <span style={{color: '#d32f2f', marginLeft: '8px'}}>(Expired)</span>
            )}
          </div>
          {oauthStatus.expiryDate && (
            <div style={{fontSize: '12px', color: '#666'}}>
              Expires: {new Date(oauthStatus.expiryDate).toLocaleString()}
            </div>
          )}
        </div>
      )}

      <div style={{borderTop: '1px solid #ddd', paddingTop: '24px'}}>
        <h4>Step 2: Calendar Selection</h4>
        <p>
          Enter your Google Calendar ID or select from your available calendars:
        </p>

        <div style={{marginBottom: '16px'}}>
          <Button 
            onClick={loadAvailableCalendars}
            disabled={loadingCalendars}
            loader={loadingCalendars}
          >
            {loadingCalendars ? 'Loading calendars...' : 'Show My Calendars'}
          </Button>
        </div>

        {showCalendarList && availableCalendars.length > 0 && (
          <div style={{
            marginBottom: '16px', 
            padding: '12px', 
            border: '1px solid #ddd', 
            borderRadius: '4px',
            maxHeight: '200px',
            overflow: 'auto'
          }}>
            <div style={{marginBottom: '8px', fontWeight: '500'}}>Your Google Calendars:</div>
            {availableCalendars.map((calendar) => (
              <div 
                key={calendar.id}
                style={{
                  padding: '8px',
                  marginBottom: '4px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                onClick={() => selectCalendar(calendar)}
              >
                <div style={{fontWeight: '500'}}>
                  {calendar.summary} {calendar.primary && '(Primary)'}
                </div>
                <div style={{fontSize: '12px', color: '#666', marginTop: '4px'}}>
                  ID: {calendar.id}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{marginBottom: '16px'}}>
          <p style={{fontSize: '14px', color: '#666', margin: '8px 0'}}>
            Or manually find your Calendar ID in Google Calendar settings:
          </p>
          <ol style={{fontSize: '14px', marginBottom: '16px'}}>
            <li>Go to Google Calendar</li>
            <li>Click the gear icon → Settings</li>
            <li>Select your calendar from the left sidebar</li>
            <li>Find "Calendar ID" in the "Integrate calendar" section</li>
          </ol>
        </div>

        {savedCalendarId && (
          <div style={{marginBottom: '16px', fontSize: '14px', color: '#666'}}>
            Current calendar ID: <strong>{savedCalendarId}</strong>
          </div>
        )}

        <div style={{marginBottom: '16px'}}>
          <Input
            placeholder="Enter your Google Calendar ID"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            disabled={savingCalendarId}
          />
        </div>

        <Button 
          primary={calendarId !== savedCalendarId}
          onClick={handleCalendarIdSubmit} 
          disabled={savingCalendarId || !calendarId.trim() || calendarId === savedCalendarId}
          loader={savingCalendarId}
        >
          {calendarId === savedCalendarId ? 'Calendar ID Saved' : 'Save Calendar ID'}
        </Button>
      </div>
    </div>
  );
};

export const App = memo(AppComponent);
