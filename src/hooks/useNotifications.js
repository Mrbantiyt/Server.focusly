// src/hooks/useNotifications.js
import { useEffect, useState } from "react";
import { watchNotifications } from "../lib/notifications";

export function useNotifications(uid) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!uid) { setNotifications([]); return; }
    return watchNotifications(uid, setNotifications);
  }, [uid]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount };
}
