import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase, Ticket } from '@/lib/supabase';
import { useAuth } from './AuthContext';

type RealtimeStatus = 'connecting' | 'live' | 'reconnecting';

interface TicketsContextType {
  tickets: Ticket[];
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string | null) => void;
  refreshTickets: () => Promise<void>;
  realtimeStatus: RealtimeStatus;
  counts: {
    pending: number;
    inProgress: number;
    resolved: number;
  };
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

const TICKET_SELECT = '*, agent_profiles!assigned_agent_id(full_name)';

// How many already-resolved tickets to keep around for browsing in "All Tickets".
// Resolved-today tickets are fetched separately and in full, so the resolved views
// are never truncated by this number.
const RESOLVED_BROWSE_LIMIT = 40;

// Safety net: realtime can drop events (sleep/wifi/rate limits) with no error, so
// reconcile on a slow timer as well. Only runs while the tab is actually visible.
const RECONCILE_INTERVAL_MS = 60_000;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const dedupeById = (tickets: Ticket[]) => {
  const byId = new Map<string, Ticket>();
  for (const ticket of tickets) byId.set(ticket.id, ticket);
  return [...byId.values()];
};

const sortByCreatedDesc = (tickets: Ticket[]) =>
  tickets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

// A ticket belongs in the working set if it is active, or was resolved today.
// Older resolved tickets are only pulled in by the initial browse query.
const belongsInWorkingSet = (ticket: Ticket) => {
  if (ticket.status !== 'Resolved') return true;
  const resolvedAt = ticket.updated_at ? new Date(ticket.updated_at) : null;
  return !!resolvedAt && resolvedAt >= startOfToday();
};

export const TicketsProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>('connecting');
  // Guards against a slow refresh landing after a newer one and resurrecting stale rows.
  const refreshSeqRef = useRef(0);

  const refreshTickets = useCallback(async () => {
    if (!profileId) return;

    const seq = ++refreshSeqRef.current;

    try {
      const todayIso = startOfToday().toISOString();

      // Active tickets, every resolved ticket from today, and a tail of older
      // resolved ones for browsing. Resolved-today is queried server-side so the
      // "resolved today" views can never be silently truncated.
      const [activeResult, resolvedTodayResult, resolvedBrowseResult] = await Promise.all([
        supabase
          .from('tickets')
          .select(TICKET_SELECT)
          .in('status', ['Pending', 'In Progress'])
          .order('created_at', { ascending: false }),
        supabase
          .from('tickets')
          .select(TICKET_SELECT)
          .eq('status', 'Resolved')
          .gte('updated_at', todayIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('tickets')
          .select(TICKET_SELECT)
          .eq('status', 'Resolved')
          .order('created_at', { ascending: false })
          .limit(RESOLVED_BROWSE_LIMIT),
      ]);

      if (activeResult.error) throw activeResult.error;
      if (resolvedTodayResult.error) throw resolvedTodayResult.error;
      if (resolvedBrowseResult.error) throw resolvedBrowseResult.error;

      // A newer refresh already finished — discard this result.
      if (seq !== refreshSeqRef.current) return;

      const allTickets = dedupeById([
        ...(activeResult.data || []),
        ...(resolvedTodayResult.data || []),
        ...(resolvedBrowseResult.data || []),
      ]);

      setTickets(sortByCreatedDesc(allTickets));
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  }, [profileId]);

  // Upsert rather than replace-only: if an INSERT was missed while the socket was
  // down, a later UPDATE still brings the ticket into the list instead of being
  // dropped on the floor until the agent refreshes.
  const upsertTicket = useCallback((ticket: Ticket) => {
    setTickets(prev => {
      const index = prev.findIndex(t => t.id === ticket.id);

      if (index === -1) {
        if (!belongsInWorkingSet(ticket)) return prev;
        return sortByCreatedDesc([ticket, ...prev]);
      }

      const next = [...prev];
      next[index] = ticket;
      return next;
    });
  }, []);

  const fetchAndUpsert = useCallback(async (ticketId: string) => {
    const { data, error } = await supabase
      .from('tickets')
      .select(TICKET_SELECT)
      .eq('id', ticketId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching updated ticket:', error);
      // Fall back to a full reconcile so the row is not lost entirely.
      refreshTickets();
      return;
    }

    if (data) upsertTicket(data);
  }, [refreshTickets, upsertTicket]);

  useEffect(() => {
    if (!profileId) return;

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const teardown = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const connect = () => {
      if (cancelled) return;

      teardown();

      // A fresh channel with a unique topic each attempt: resubscribing a channel
      // object that has already errored is unreliable, and removing then instantly
      // rejoining an identical topic can leave the new channel silently unjoined.
      channel = supabase
        .channel(`tickets-updates-${profileId}-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tickets' },
          (payload) => fetchAndUpsert(payload.new.id as string)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tickets' },
          (payload) => fetchAndUpsert(payload.new.id as string)
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'tickets' },
          (payload) => {
            setTickets(prev => prev.filter(t => t.id !== payload.old.id));
          }
        )
        .subscribe((status: string) => {
          if (cancelled) return;

          if (status === 'SUBSCRIBED') {
            setRealtimeStatus('live');
            // Reconcile on every (re)connect to pick up whatever was missed while
            // the socket was down, and to close the gap between the initial fetch
            // below and the channel actually joining.
            refreshTickets();
            return;
          }

          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setRealtimeStatus('reconnecting');
            clearTimeout(retryTimeout);
            retryTimeout = setTimeout(connect, 3000);
          }
        });
    };

    // Load immediately and unconditionally: if realtime is unavailable the agent
    // still gets a working (polled) list rather than an empty one.
    refreshTickets();
    connect();

    const reconcile = () => {
      if (document.visibilityState === 'visible') refreshTickets();
    };

    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('online', reconcile);
    const interval = setInterval(reconcile, RECONCILE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(retryTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('online', reconcile);
      teardown();
    };
  }, [profileId, refreshTickets, fetchAndUpsert]);

  const counts = {
    pending: tickets.filter(t => t.status === 'Pending').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
  };

  return (
    <TicketsContext.Provider
      value={{ tickets, selectedTicketId, setSelectedTicketId, refreshTickets, realtimeStatus, counts }}
    >
      {children}
    </TicketsContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketsContext);
  if (!context) throw new Error('useTickets must be used within TicketsProvider');
  return context;
};
