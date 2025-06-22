import React, {memo, useCallback, useEffect, useState} from 'react';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import Input from '@jetbrains/ring-ui-built/components/input/input';
import Alert, {AlertType} from '@jetbrains/ring-ui-built/components/alert/alert';

// Register widget in YouTrack
const host = await YTApp.register();

interface AppsScriptConfigResponse {
  appsScriptUrl?: string;
  hasApiKey?: boolean;
  calendarId?: string;
  error?: string;
}

interface SaveConfigResponse {
  success?: boolean;
  error?: string;
}

interface TestConnectionResponse {
  success?: boolean;
  message?: string;
  appsScriptResponse?: any;
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

interface CalendarIdResponse {
  calendarId?: string;
  error?: string;
}

interface SetCalendarIdResponse {
  success?: boolean;
  error?: string;
}

const AppComponent: React.FunctionComponent = () => {
  const [appsScriptUrl, setAppsScriptUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [calendarId, setCalendarId] = useState<string>('');
  const [savedCalendarId, setSavedCalendarId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [savingCalendarId, setSavingCalendarId] = useState<boolean>(false);
  const [loadingCalendars, setLoadingCalendars] = useState<boolean>(false);
  const [availableCalendars, setAvailableCalendars] = useState<Calendar[]>([]);
  const [showCalendarList, setShowCalendarList] = useState<boolean>(false);
  const [message, setMessage] = useState<{type: AlertType, text: string} | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [connectionTested, setConnectionTested] = useState<boolean>(false);

  // Fetch current configuration on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        console.log('Fetching Apps Script configuration...');
        const configResult = await host.fetchApp('backend/appscript/config', {}) as AppsScriptConfigResponse;
        
        if (configResult.appsScriptUrl) {
          setAppsScriptUrl(configResult.appsScriptUrl);
        }
        
        if (configResult.hasApiKey) {
          setHasApiKey(true);
        }
        
        if (configResult.calendarId) {
          setSavedCalendarId(configResult.calendarId);
          setCalendarId(configResult.calendarId);
        }

        if (configResult.error) {
          console.error('Failed to get configuration:', configResult.error);
          setMessage({type: AlertType.ERROR, text: configResult.error});
        }
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setMessage({type: AlertType.ERROR, text: 'Failed to load initial data'});
      }
    };
    fetchInitialData();
  }, []);

  const handleConfigSubmit = useCallback(async () => {
    if (!appsScriptUrl.trim()) {
      setMessage({type: AlertType.ERROR, text: 'Please enter your Apps Script URL'});
      return;
    }

    if (!apiKey.trim()) {
      setMessage({type: AlertType.ERROR, text: 'Please enter your API key'});
      return;
    }

    setSavingConfig(true);
    setMessage(null);

    try {
      const result = await host.fetchApp('backend/appscript/save-config', {
        method: 'POST',
        body: {
          appsScriptUrl: appsScriptUrl.trim(),
          apiKey: apiKey.trim()
        }
      }) as SaveConfigResponse;

      if (result.success) {
        console.log('Apps Script configuration saved successfully!');
        setMessage({type: AlertType.SUCCESS, text: 'Apps Script configuration saved successfully!'});
        setHasApiKey(true);
        setConnectionTested(false); // Reset connection test status
      } else if (result.error) {
        console.error('Failed to save configuration:', result.error);
        setMessage({type: AlertType.ERROR, text: result.error});
      }
    } catch (error) {
      console.error('Failed to save configuration:', error);
      setMessage({type: AlertType.ERROR, text: 'Failed to save configuration'});
    } finally {
      setSavingConfig(false);
    }
  }, [appsScriptUrl, apiKey]);

  const handleTestConnection = useCallback(async () => {
    setTestingConnection(true);
    setMessage(null);

    try {
      const result = await host.fetchApp('backend/appscript/test', {
        method: 'POST',
        body: {}
      }) as TestConnectionResponse;

      if (result.success) {
        console.log('Connection test successful!');
        setMessage({type: AlertType.SUCCESS, text: 'Connection to Apps Script successful! You can now load calendars.'});
        setConnectionTested(true);
      } else if (result.error) {
        console.error('Connection test failed:', result.error);
        setMessage({type: AlertType.ERROR, text: `Connection failed: ${result.error}`});
        setConnectionTested(false);
      }
    } catch (error) {
      console.error('Failed to test connection:', error);
      setMessage({type: AlertType.ERROR, text: 'Failed to test connection'});
      setConnectionTested(false);
    } finally {
      setTestingConnection(false);
    }
  }, []);

  const loadAvailableCalendars = useCallback(async () => {
    setLoadingCalendars(true);
    setMessage(null);

    try {
      const result = await host.fetchApp(
        'backend/calendar/list',
        {
          method: 'POST',
          body: {}
        }
      ) as CalendarListResponse;

      if (result.calendars) {
        console.log('Calendars loaded:', result.calendars.length);
        setAvailableCalendars(result.calendars);
        setShowCalendarList(true);
        setMessage({type: AlertType.SUCCESS, text: `Found ${result.calendars.length} calendars`});
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

  const handleCalendarIdSubmit = useCallback(async () => {
    if (!calendarId.trim()) {
      setMessage({type: AlertType.ERROR, text: 'Please enter a calendar ID'});
      return;
    }

    setSavingCalendarId(true);
    setMessage(null);

    try {
      const result = await host.fetchApp('backend/calendar/save-id', {
        method: 'POST',
        body: { calendarId: calendarId.trim() }
      }) as SetCalendarIdResponse;

      if (result.success) {
        console.log('Calendar ID saved successfully!');
        setMessage({type: AlertType.SUCCESS, text: 'Calendar ID saved successfully! Setup complete.'});
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

  const isConfigComplete = hasApiKey && appsScriptUrl && connectionTested;
  const isSetupComplete = isConfigComplete && savedCalendarId;

  return (
    <div className="widget">
      <h3>Google Calendar Setup (Apps Script)</h3>

      {message && (
        <Alert type={message.type} closeable onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {isSetupComplete && (
        <div style={{
          marginBottom: '24px',
          padding: '12px',
          backgroundColor: '#e8f5e8',
          borderRadius: '4px',
          border: '1px solid #4caf50'
        }}>
          <div style={{fontWeight: '500', color: '#2e7d32', marginBottom: '8px'}}>
            ✅ Setup Complete!
          </div>
          <div style={{fontSize: '14px', color: '#2e7d32'}}>
            Your YouTrack issues will now sync with Google Calendar.
          </div>
        </div>
      )}

      <div style={{marginBottom: '24px'}}>
        <h4>Step 1: Apps Script Configuration</h4>
        <p style={{fontSize: '14px', color: '#666', marginBottom: '16px'}}>
          You need to deploy your own Google Apps Script to avoid authentication issues.
        </p>

        <div style={{marginBottom: '16px'}}>
          <label style={{display: 'block', fontWeight: '500', marginBottom: '8px'}}>
            Apps Script Web App URL:
          </label>
          <Input
            placeholder="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
            value={appsScriptUrl}
            onChange={(e) => setAppsScriptUrl(e.target.value)}
            disabled={savingConfig}
          />
          <div style={{fontSize: '12px', color: '#666', marginTop: '4px'}}>
            This is the URL you get when you deploy your Apps Script as a web app
          </div>
        </div>

        <div style={{marginBottom: '16px'}}>
          <label style={{display: 'block', fontWeight: '500', marginBottom: '8px'}}>
            API Key:
          </label>
          <Input
            type="password"
            placeholder="Your Apps Script API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={savingConfig}
          />
          <div style={{fontSize: '12px', color: '#666', marginTop: '4px'}}>
            Run setupApiKey() in your Apps Script to generate this
          </div>
        </div>

        <Button 
          primary 
          onClick={handleConfigSubmit} 
          disabled={savingConfig || !appsScriptUrl.trim() || !apiKey.trim()}
          loader={savingConfig}
          style={{marginRight: '12px'}}
        >
          Save Configuration
        </Button>

        {hasApiKey && appsScriptUrl && (
          <Button 
            onClick={handleTestConnection} 
            disabled={testingConnection || savingConfig}
            loader={testingConnection}
          >
            Test Connection
          </Button>
        )}

        {hasApiKey && (
          <div style={{
            marginTop: '12px',
            fontSize: '13px',
            color: connectionTested ? '#2e7d32' : '#666'
          }}>
            {connectionTested ? '✅ Connection verified' : '⚠️ Connection not tested yet'}
          </div>
        )}
      </div>

      {isConfigComplete && (
        <div style={{borderTop: '1px solid #ddd', paddingTop: '24px'}}>
          <h4>Step 2: Calendar Selection</h4>
          <p style={{fontSize: '14px', color: '#666', marginBottom: '16px'}}>
            Choose which Google Calendar to sync your YouTrack issues with:
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

          {savedCalendarId && (
            <div style={{marginBottom: '16px', fontSize: '14px', color: '#666'}}>
              Current calendar: <strong>{savedCalendarId}</strong>
            </div>
          )}

          <div style={{marginBottom: '16px'}}>
            <Input
              placeholder="Or enter calendar ID manually"
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
            {calendarId === savedCalendarId ? 'Calendar Saved' : 'Save Calendar'}
          </Button>
        </div>
      )}

      {!isConfigComplete && (
        <div style={{
          marginTop: '24px',
          padding: '16px',
          backgroundColor: '#fff3cd',
          borderRadius: '4px',
          border: '1px solid #ffc107'
        }}>
          <div style={{fontWeight: '500', marginBottom: '8px'}}>📋 Setup Instructions:</div>
          <ol style={{fontSize: '14px', paddingLeft: '20px', margin: 0}}>
            <li>Create a Google Apps Script project at script.google.com</li>
            <li>Copy the provided Apps Script code into your project</li>
            <li>Run setupApiKey() function to generate an API key</li>
            <li>Deploy as Web App with "Execute as: Me" and "Anyone" access</li>
            <li>Copy the web app URL and API key above</li>
            <li>Test the connection to verify everything works</li>
          </ol>
        </div>
      )}
    </div>
  );
};

export const App = memo(AppComponent);