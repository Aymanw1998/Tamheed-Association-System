import React from 'react';
import { Routes, Route, BrowserRouter, useNavigate } from 'react-router-dom';

import logo from './logo.svg';
import './App.css';
console.log("React version:", React.version);


import CRoutes from "./Components/Routes/Routes";

function App() {
  return (
    <div className="App">
      <BrowserRouter><CRoutes/></BrowserRouter>
    </div>
  );
}

export default App;
