const { createClient } = require("@supabase/supabase-js");

let supabaseClient = null;
let realtimeChannel = null;
let currentConfig = null;

/**
 * Tests connecting to a Supabase project URL and Anon key.
 */
async function testSupabaseConnection({ url, key }) {
  if (!url || !key) {
    return { success: false, error: "Please provide both Supabase URL and Anon Key." };
  }

  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanKey = key.trim();
  if (!cleanUrl.startsWith("https://")) {
    return { success: false, error: "Supabase URL must start with https://" };
  }

  try {
    const res = await fetch(`${cleanUrl}/auth/v1/settings`, {
      headers: {
        apikey: cleanKey,
        Authorization: `Bearer ${cleanKey}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      return { success: false, error: "Invalid Anon Key (Unauthorized)." };
    }

    if (res.ok || res.status === 200) {
      return { success: true };
    }

    return { success: false, error: `Supabase returned HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: `Connection failed: ${err.message}` };
  }
}

/**
 * Initializes Supabase client, presence tracking, and real-time broadcast listeners.
 */
function initSupabase({
  url,
  key,
  channelName = "coucou-badsha-ayzil",
  userName = "Badsha",
  userRole = "me",
  onChatMessage,
  onFileShared,
  onScheduleUpdated,
  onPresenceSync,
  onRemoteAccess,
}) {
  if (!url || !key) return null;

  disconnectSupabase();

  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanKey = key.trim();

  try {
    supabaseClient = createClient(cleanUrl, cleanKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });

    currentConfig = { channelName, userName, userRole };

    realtimeChannel = supabaseClient.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: userName },
      },
    });

    // 1. Broadcast: File Sharing
    realtimeChannel.on("broadcast", { event: "file_shared" }, ({ payload }) => {
      console.log("[Supabase Realtime] Received file_shared event:", payload?.fileName);
      if (typeof onFileShared === "function" && payload) {
        try {
          onFileShared(payload);
        } catch (e) {
          console.warn("[Supabase Realtime] onFileShared error:", e);
        }
      }
    });

    // 2. Broadcast: Schedule & Task Updates
    realtimeChannel.on("broadcast", { event: "schedule_update" }, ({ payload }) => {
      console.log("[Supabase Realtime] Received schedule_update event from:", payload?.senderName);
      if (typeof onScheduleUpdated === "function" && payload) {
        try {
          onScheduleUpdated(payload);
        } catch (e) {
          console.warn("[Supabase Realtime] onScheduleUpdated error:", e);
        }
      }
    });

    // 3. Presence: Partner Online Status
    realtimeChannel.on("presence", { event: "sync" }, () => {
      const state = realtimeChannel.presenceState();
      console.log("[Supabase Realtime] Presence sync:", Object.keys(state));
      if (typeof onPresenceSync === "function") {
        try {
          onPresenceSync(state);
        } catch (e) {
          console.warn("[Supabase Realtime] onPresenceSync error:", e);
        }
      }
    });

    // 4. Broadcast: Live Partner Chat
    realtimeChannel.on("broadcast", { event: "partner_chat" }, ({ payload }) => {
      console.log("[Supabase Realtime] Received partner_chat event from:", payload?.sender, payload?.text);
      if (typeof onChatMessage === "function" && payload) {
        try {
          onChatMessage(payload);
        } catch (e) {
          console.error("[Supabase Realtime] onChatMessage error:", e);
        }
      }
    });

    // 5. Broadcast: Remote Desktop Access (Mochi Eye)
    realtimeChannel.on("broadcast", { event: "remote_access" }, ({ payload }) => {
      console.log("[Supabase Realtime] Received remote_access event:", payload?.action, "from:", payload?.sender);
      if (typeof onRemoteAccess === "function" && payload) {
        try {
          onRemoteAccess(payload);
        } catch (e) {
          console.error("[Supabase Realtime] onRemoteAccess error:", e);
        }
      }
    });

    // Subscribe and track self
    realtimeChannel.subscribe(async (status) => {
      console.log(`[Supabase Realtime] Subscription status for ${channelName}:`, status);
      if (status === "SUBSCRIBED") {
        try {
          await realtimeChannel.track({
            user: userName,
            role: userRole,
            online: true,
            updatedAt: Date.now(),
          });
        } catch (e) {
          console.warn("[Supabase Realtime] Presence track warning:", e);
        }
      }
    });

    return realtimeChannel;
  } catch (err) {
    console.error("[Supabase Realtime] Init error:", err);
    return null;
  }
}

/**
 * Disconnects existing channel and client.
 */
function disconnectSupabase() {
  if (realtimeChannel && supabaseClient) {
    try {
      realtimeChannel.untrack();
      supabaseClient.removeChannel(realtimeChannel);
    } catch (e) {
      console.warn("Channel cleanup error:", e);
    }
  }
  realtimeChannel = null;
  supabaseClient = null;
  currentConfig = null;
}

/**
 * Broadcasts file metadata to the partner's PC in real-time (<50ms).
 */
async function broadcastFileShared(payload) {
  if (!realtimeChannel) return false;
  try {
    const res = await realtimeChannel.send({
      type: "broadcast",
      event: "file_shared",
      payload: {
        ...payload,
        timestamp: Date.now(),
      },
    });
    console.log("[Supabase Realtime] Broadcast file_shared result:", res);
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast file error:", err);
    return false;
  }
}

/**
 * Broadcasts schedule updates to the partner's PC in real-time (<50ms).
 */
async function broadcastScheduleUpdate(payload) {
  if (!realtimeChannel) return false;
  try {
    const res = await realtimeChannel.send({
      type: "broadcast",
      event: "schedule_update",
      payload: {
        ...payload,
        timestamp: Date.now(),
      },
    });
    console.log("[Supabase Realtime] Broadcast schedule_update result:", res);
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast schedule error:", err);
    return false;
  }
}

/**
 * Broadcasts a live chat message to the partner's PC in real-time (<50ms).
 */
async function broadcastChatMessage(payload) {
  if (!realtimeChannel) return false;
  try {
    const res = await realtimeChannel.send({
      type: "broadcast",
      event: "partner_chat",
      payload: {
        ...payload,
        timestamp: payload.timestamp || Date.now(),
      },
    });
    console.log("[Supabase Realtime] Broadcast partner_chat result:", res);
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast chat error:", err);
    return false;
  }
/**
 * Broadcasts remote desktop co-pilot signals to the partner's PC (Mochi Eye).
 */
async function broadcastRemoteAccess(payload) {
  if (!realtimeChannel) return false;
  try {
    const res = await realtimeChannel.send({
      type: "broadcast",
      event: "remote_access",
      payload: {
        ...payload,
        timestamp: Date.now(),
      },
    });
    console.log("[Supabase Realtime] Broadcast remote_access result:", res);
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast remote_access error:", err);
    return false;
  }
}

module.exports = {
  testSupabaseConnection,
  initSupabase,
  disconnectSupabase,
  broadcastFileShared,
  broadcastScheduleUpdate,
  broadcastChatMessage,
  broadcastRemoteAccess,
};
