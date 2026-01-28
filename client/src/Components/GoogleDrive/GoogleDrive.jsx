import React, { useEffect, useMemo, useState } from "react";
import {
  listDrive,
  uploadDrive,
  deleteDriveItem,
  createDriveFolder,
  renameDriveItem,
  downloadDrive,
} from "../../WebServer/services/googleDrive/functionGoogleDrive.jsx";

import { toast } from "../../ALERT/SystemToasts";

const isFolder = (item) => item?.mimeType === "application/vnd.google-apps.folder";

const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("he-IL");
};

const formatSize = (size) => {
  if (!size) return "";
  const n = Number(size);
  if (Number.isNaN(n)) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v = v / 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export default function PageDrive() {
  const connectGoogleDrive = async () => {
    window.location.href = `http://localhost:2025/api/google/oauth/start`;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Google Drive Integration</h1>
      <button onClick={connectGoogleDrive}>Connect to Google Drive</button>
    </div>
  )
}
