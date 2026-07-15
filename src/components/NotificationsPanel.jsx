// src/components/NotificationsPanel.jsx
import React, { useState } from "react";
import { X, Coins, Sparkles, Gift, Bell, Trash2, Loader2, Check } from "lucide-react";
import { COL, neu } from "../theme";
import { STORE_ITEMS } from "../lib/storeItems";
import { claimNotification, deleteAllNotifications } from "../lib/notifications";

function timeAgo(ts) {
  if (!ts?.toMillis) return "";
  const ms = Date.now() - ts.toMillis();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function iconFor(type) {
  if (type === "coins") return { Icon: Coins, color: COL.gold };
  if (type === "xp") return { Icon: Sparkles, color: COL.violet };
  if (type === "item") return { Icon: Gift, color: COL.mint };
  return { Icon: Bell, color: COL.blue };
}

function rewardLabel(n) {
  if (n.type === "coins") return `+${n.amount} coins`;
  if (n.type === "xp") return `+${n.amount} XP`;
  if (n.type === "item") {
    const item = STORE_ITEMS.find((it) => it.id === n.itemId);
    return item ? `New icon: ${item.name}` : "New app icon";
  }
  return null;
}

function NotificationRow({ uid, notif }) {
  const [claiming, setClaiming] = useState(false);
  const { Icon, color } = iconFor(notif.type);
  const isReward = notif.type === "coins" || notif.type === "xp" || notif.type === "item";
  const reward = isReward ? rewardLabel(notif) : null;

  async function handleClaim() {
    setClaiming(true);
    try {
      await claimNotification(uid, notif.id);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div style={neu(false, 18)} className="p-4 flex gap-3">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${color}22` }}
      >
        <Icon size={16} color={color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="font-display font-semibold text-sm truncate" style={{ color: COL.ink }}>
            {notif.title}
          </div>
          {!notif.read && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COL.coral }} />}
        </div>
        {notif.body && (
          <div className="font-body text-xs mt-0.5" style={{ color: COL.sub }}>{notif.body}</div>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="font-body text-[11px]" style={{ color: COL.sub }}>{timeAgo(notif.createdAt)}</span>

          {isReward && (
            notif.claimed ? (
              <span className="flex items-center gap-1 font-body text-[11px] font-semibold" style={{ color: COL.mint }}>
                <Check size={12} /> Claimed
              </span>
            ) : (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="flex items-center gap-1 px-3 py-1 rounded-full font-body text-[11px] font-semibold text-white disabled:opacity-60"
                style={{ background: COL.violet }}
              >
                {claiming ? <Loader2 size={11} className="animate-spin" /> : null}
                {reward ? `Claim ${reward}` : "Claim"}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPanel({ uid, notifications, onClose }) {
  const [clearing, setClearing] = useState(false);

  async function handleClearAll() {
    setClearing(true);
    try {
      await deleteAllNotifications(uid);
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(20,18,40,0.55)" }} onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-t-[28px] flex flex-col"
        style={{ background: COL.bg, maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-4">
          <div>
            <div className="font-display font-bold text-lg" style={{ color: COL.ink }}>Notifications</div>
            <div className="font-body text-xs" style={{ color: COL.sub }}>
              {notifications.length === 0 ? "You're all caught up" : `${notifications.length} message${notifications.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={neu(false, 999)}>
            <X size={16} color={COL.sub} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-2.5">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2">
              <Bell size={28} color={COL.sub} />
              <div className="font-body text-sm" style={{ color: COL.sub }}>Nothing here yet</div>
            </div>
          ) : (
            notifications.map((n) => <NotificationRow key={n.id} uid={uid} notif={n} />)
          )}
        </div>

        {notifications.length > 0 && (
          <div className="px-5 pb-5 pt-1">
            <button
              onClick={handleClearAll}
              disabled={clearing}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-body text-sm font-medium disabled:opacity-60"
              style={{ ...neu(false, 16), color: COL.coral }}
            >
              {clearing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete all
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
