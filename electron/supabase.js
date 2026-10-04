const { createClient } = require("@supabase/supabase-js");

let supabaseClient = null;
let realtimeChannel = null;
let currentConfig = null;
let dbChangesChannel = null;

const SUPABASE_SQL_SETUP = `-- ========================================================
-- 🍡 MOCHI 24/7 OFFLINE CLOUD STORAGE SETUP
-- Run this once in your Supabase SQL Editor (supabase.com)
-- ========================================================

-- 1. Create table for persistent messages (delivered even when PC was off)
create table if not exists public.mochi_messages (
  id text primary key,
  channel text not null default 'coucou-badsha-ayzil',
  sender text not null,
  recipient text not null,
  text text not null,
  timestamp bigint not null,
  is_ai_generated boolean default false,
  read boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create table for shared couple tasks & schedule
create table if not exists public.mochi_tasks (
  id text primary key,
  channel text not null default 'coucou-badsha-ayzil',
  title text not null,
  time text default '',
  assignee text default '',
  assigned_by text default '',
  completed boolean default false,
  created_at bigint default (extract(epoch from now()) * 1000),
  updated_at bigint default (extract(epoch from now()) * 1000)
);

-- 3. Enable Row Level Security (RLS)
alter table public.mochi_messages enable row level security;
alter table public.mochi_tasks enable row level security;

-- 4. Create policies to allow read and write via Anon key
drop policy if exists "Allow all on mochi_messages" on public.mochi_messages;
create policy "Allow all on mochi_messages" on public.mochi_messages for all using (true) with check (true);

drop policy if exists "Allow all on mochi_tasks" on public.mochi_tasks;
create policy "Allow all on mochi_tasks" on public.mochi_tasks for all using (true) with check (true);

-- 5. Enable Supabase Realtime broadcast for database changes (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mochi_messages'
  ) then
    alter publication supabase_realtime add table public.mochi_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mochi_tasks'
  ) then
    alter publication supabase_realtime add table public.mochi_tasks;
  end if;
end $$;
`;

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
 * Checks whether the cloud persistent tables (mochi_messages & mochi_tasks) exist in Supabase.
 */
async function checkCloudStorageReady() {
  if (!supabaseClient) {
    return { ready: false, error: "Supabase not initialized yet" };
  }

  try {
    const { error: msgErr } = await supabaseClient.from("mochi_messages").select("id").limit(1);
    if (msgErr) {
      return { ready: false, error: msgErr.message, code: msgErr.code };
    }

    const { error: taskErr } = await supabaseClient.from("mochi_tasks").select("id").limit(1);
    if (taskErr) {
      return { ready: false, error: taskErr.message, code: taskErr.code };
    }

    return { ready: true };
  } catch (err) {
    return { ready: false, error: err.message };
  }
}

/**
 * Initializes Supabase client, presence tracking, real-time broadcast listeners, and DB catch-up.
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
  onSyncRequest,
  onSyncResponse,
  onPartnerJoin,
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

    // 6. Broadcast: Peer Catch-Up Sync Request
    realtimeChannel.on("broadcast", { event: "sync_request" }, ({ payload }) => {
      console.log("[Supabase Realtime] Partner requested peer catch-up sync from:", payload?.senderName);
      if (typeof onSyncRequest === "function" && payload) {
        try {
          onSyncRequest(payload);
        } catch (e) {
          console.warn("[Supabase Realtime] onSyncRequest error:", e);
        }
      }
    });

    // 7. Broadcast: Peer Catch-Up Sync Response
    realtimeChannel.on("broadcast", { event: "sync_response" }, ({ payload }) => {
      console.log("[Supabase Realtime] Received peer catch-up sync response from:", payload?.senderName);
      if (typeof onSyncResponse === "function" && payload) {
        try {
          onSyncResponse(payload);
        } catch (e) {
          console.warn("[Supabase Realtime] onSyncResponse error:", e);
        }
      }
    });

    // 8. Broadcast: Partner Online Join Announcement
    realtimeChannel.on("broadcast", { event: "partner_join" }, ({ payload }) => {
      console.log("[Supabase Realtime] Received partner_join event from:", payload?.senderName);
      if (typeof onPartnerJoin === "function" && payload) {
        try {
          onPartnerJoin(payload);
        } catch (e) {
          console.warn("[Supabase Realtime] onPartnerJoin error:", e);
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

        // Announce presence immediately to partner
        try {
          await realtimeChannel.send({
            type: "broadcast",
            event: "partner_join",
            payload: {
              senderName: userName,
              senderRole: userRole,
              timestamp: Date.now(),
            },
          });
        } catch (sendErr) {
          console.warn("[Supabase Realtime] partner_join broadcast error:", sendErr);
        }
      }
    });

    // Also listen to database change streams if tables are created
    try {
      dbChangesChannel = supabaseClient
        .channel("db_changes_" + channelName)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "mochi_messages",
            filter: `channel=eq.${channelName}`,
          },
          (payload) => {
            const newRow = payload?.new;
            if (newRow && typeof onChatMessage === "function") {
              // Ignore messages we sent ourselves
              if ((newRow.sender || "").toLowerCase() !== userName.toLowerCase()) {
                onChatMessage({
                  id: newRow.id,
                  sender: newRow.sender,
                  recipient: newRow.recipient,
                  text: newRow.text,
                  timestamp: Number(newRow.timestamp),
                  isAiGenerated: !!newRow.is_ai_generated,
                  read: !!newRow.read,
                });
              }
            }
          }
        )
        .subscribe();
    } catch (dbErr) {
      console.warn("[Supabase Realtime] DB changes subscription notice:", dbErr.message);
    }

    return realtimeChannel;
  } catch (err) {
    console.error("[Supabase Realtime] Init error:", err);
    return null;
  }
}

/**
 * Disconnects existing channels and client.
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
  if (dbChangesChannel && supabaseClient) {
    try {
      supabaseClient.removeChannel(dbChangesChannel);
    } catch (e) {}
  }
  realtimeChannel = null;
  dbChangesChannel = null;
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
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast chat error:", err);
    return false;
  }
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
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast remote_access error:", err);
    return false;
  }
}

/**
 * Broadcasts a peer-to-peer sync request (asking partner for any missed messages/tasks).
 */
async function broadcastSyncRequest(payload) {
  if (!realtimeChannel) return false;
  try {
    const res = await realtimeChannel.send({
      type: "broadcast",
      event: "sync_request",
      payload: {
        ...payload,
        timestamp: Date.now(),
      },
    });
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast sync_request error:", err);
    return false;
  }
}

/**
 * Broadcasts a peer-to-peer sync response (sending missed messages and schedule).
 */
async function broadcastSyncResponse(payload) {
  if (!realtimeChannel) return false;
  try {
    const res = await realtimeChannel.send({
      type: "broadcast",
      event: "sync_response",
      payload: {
        ...payload,
        timestamp: Date.now(),
      },
    });
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast sync_response error:", err);
}

/**
 * Broadcasts partner join announcement.
 */
async function broadcastPartnerJoin(payload) {
  if (!realtimeChannel) return false;
  try {
    const res = await realtimeChannel.send({
      type: "broadcast",
      event: "partner_join",
      payload: {
        ...payload,
        timestamp: Date.now(),
      },
    });
    return res === "ok";
  } catch (err) {
    console.warn("[Supabase Realtime] Broadcast partner_join error:", err);
    return false;
  }
}

// ── Cloud Database Storage (24/7 Offline Sync) ──────────────────────────────

/**
 * Saves a chat message to the persistent mochi_messages table.
 */
async function saveChatMessageToCloud(msg, channelName = "coucou-badsha-ayzil") {
  if (!supabaseClient) return false;
  try {
    const row = {
      id: msg.id,
      channel: channelName,
      sender: msg.sender,
      recipient: msg.recipient,
      text: msg.text,
      timestamp: msg.timestamp || Date.now(),
      is_ai_generated: !!msg.isAiGenerated,
      read: !!msg.read,
    };
    const { error } = await supabaseClient.from("mochi_messages").upsert(row);
    if (error) {
      // Table doesn't exist yet or other permission issue
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Fetches offline chat messages stored in the cloud table.
 */
async function fetchOfflineChatMessages(channelName = "coucou-badsha-ayzil", sinceTimestamp = 0) {
  if (!supabaseClient) return [];
  try {
    let query = supabaseClient
      .from("mochi_messages")
      .select("*")
      .eq("channel", channelName)
      .order("timestamp", { ascending: true })
      .limit(100);

    if (sinceTimestamp > 0) {
      query = query.gt("timestamp", sinceTimestamp);
    }

    const { data, error } = await query;
    if (error) return [];

    return (data || []).map((row) => ({
      id: row.id,
      sender: row.sender,
      recipient: row.recipient,
      text: row.text,
      timestamp: Number(row.timestamp),
      isAiGenerated: !!row.is_ai_generated,
      read: !!row.read,
    }));
  } catch (err) {
    return [];
  }
}

/**
 * Saves a single task to the cloud table.
 */
async function saveTaskToCloud(task, channelName = "coucou-badsha-ayzil") {
  if (!supabaseClient || !task) return false;
  try {
    const row = {
      id: task.id,
      channel: channelName,
      title: task.title || "",
      time: task.time || "",
      assignee: task.assignee || "",
      assigned_by: task.assignedBy || "",
      completed: !!task.completed,
      created_at: task.createdAt || Date.now(),
      updated_at: Date.now(),
    };
    const { error } = await supabaseClient.from("mochi_tasks").upsert(row);
    if (error) return false;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Saves all active schedule tasks to the cloud table.
 */
async function saveAllTasksToCloud(tasks, channelName = "coucou-badsha-ayzil") {
  if (!supabaseClient || !Array.isArray(tasks) || tasks.length === 0) return false;
  try {
    const rows = tasks.map((task) => ({
      id: task.id,
      channel: channelName,
      title: task.title || "",
      time: task.time || "",
      assignee: task.assignee || "",
      assigned_by: task.assignedBy || "",
      completed: !!task.completed,
      created_at: task.createdAt || Date.now(),
      updated_at: Date.now(),
    }));
    const { error } = await supabaseClient.from("mochi_tasks").upsert(rows);
    if (error) return false;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Deletes a task from the cloud table.
 */
async function deleteTaskFromCloud(taskId, channelName = "coucou-badsha-ayzil") {
  if (!supabaseClient || !taskId) return false;
  try {
    const { error } = await supabaseClient
      .from("mochi_tasks")
      .delete()
      .eq("id", taskId)
      .eq("channel", channelName);
    if (error) return false;
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Fetches all tasks stored in the cloud table.
 */
async function fetchOfflineTasks(channelName = "coucou-badsha-ayzil") {
  if (!supabaseClient) return [];
  try {
    const { data, error } = await supabaseClient
      .from("mochi_tasks")
      .select("*")
      .eq("channel", channelName);
    if (error) return [];

    return (data || []).map((row) => ({
      id: row.id,
      title: row.title,
      time: row.time || "",
      assignee: row.assignee || "",
      assignedBy: row.assigned_by || "",
      completed: !!row.completed,
      createdAt: Number(row.created_at) || Date.now(),
      updatedAt: Number(row.updated_at) || Date.now(),
    }));
  } catch (err) {
    return [];
  }
}

module.exports = {
  SUPABASE_SQL_SETUP,
  testSupabaseConnection,
  checkCloudStorageReady,
  initSupabase,
  disconnectSupabase,
  broadcastFileShared,
  broadcastScheduleUpdate,
  broadcastChatMessage,
  broadcastRemoteAccess,
  broadcastSyncRequest,
  broadcastSyncResponse,
  broadcastPartnerJoin,
  saveChatMessageToCloud,
  fetchOfflineChatMessages,
  saveTaskToCloud,
  saveAllTasksToCloud,
  deleteTaskFromCloud,
  fetchOfflineTasks,
};
