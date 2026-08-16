import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import Backoffice from "./Backoffice.jsx";

/* /?bo=1 opens the back of house, anything else is the guest surface */
const bo = new URLSearchParams(location.search).has("bo");
const Root = bo ? Backoffice : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode><Root /></React.StrictMode>
);
