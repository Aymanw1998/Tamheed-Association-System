import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import CRoutes from './Components/Routes/Routes';

import { bindAccessTokenRefreshListener, scheduleAccessRefresh } from './WebServer/utils/accessScheduler';

function App() {
  useEffect(() => {
    bindAccessTokenRefreshListener();

    const savedAccess = localStorage.getItem("accessToken");
    if (savedAccess) scheduleAccessRefresh(savedAccess);
  }, []);

  return (
        <BrowserRouter>
          <CRoutes />
        </BrowserRouter>
  );
}

export default App;
