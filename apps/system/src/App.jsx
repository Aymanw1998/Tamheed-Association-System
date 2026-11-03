import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import CRoutes from './Components/Routes/Routes';

import { bindAccessTokenRefreshListener, scheduleAccessRefresh } from './WebServer/utils/accessScheduler';
import { I18nProvider } from './i18n/I18nContext';

function App() {
  useEffect(() => {
    bindAccessTokenRefreshListener();

    const savedAccess = localStorage.getItem("accessToken");
    if (savedAccess) scheduleAccessRefresh(savedAccess);
  }, []);

  return (
    <I18nProvider>
        <BrowserRouter>
          <CRoutes />
        </BrowserRouter>
    </I18nProvider>
  );
}

export default App;
