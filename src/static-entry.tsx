import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "@/routes/index";
import "@/styles.css";

const el = document.getElementById("root");
if (el) createRoot(el).render(<React.StrictMode><Dashboard /></React.StrictMode>);
