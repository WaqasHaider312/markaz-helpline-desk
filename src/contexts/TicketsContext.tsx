import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase, Ticket } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface TicketsContextType {
  tickets: Ticket[];
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string | null) => void;
  refreshTickets: () => Promise<void>;
  loadMoreTickets: () => Promise<void>;
  hasMore: boolean;
  isLoadingMore: boolean;
  counts: {
    pending: number;
    inProgress: number;
    resolved: number;
  };
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

const TICKETS_PER_PAGE = 20;

export const TicketsProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const channelRef = useRef<any>(null);

  const refreshTickets = async () => {
    if (!profile) return;

    try {
      // Get total count
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true });

      setTotalCount(count || 0);

      // Load only first 20 tickets
      const { data, error } = await supabase
        .from('tickets')
        .select('*, agent_profiles!assigned_agent_id(full_name)')
        .order('created_at', { ascending: false })
        .range(0, TICKETS_PER_PAGE - 1);

      if (error) throw error;
      
      setTickets(data || []);
      setCurrentPage(1);
      setHasMore((data?.length || 0) === TICKETS_PER_PAGE && (count || 0) > TICKETS_PER_PAGE);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    }
  };

  const loadMoreTickets = async () => {
    if (!profile || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const startIndex = currentPage * TICKETS_PER_PAGE;
      const endIndex = startIndex + TICKETS_PER_PAGE - 1;

      const { data, error } = await supabase
        .from('tickets')
        .select('*, agent_profiles!assigned_agent_id(full_name)')
        .order('created_at', { ascending: false })
        .range(startIndex, endIndex);

      if (error) throw error;

      setTickets(prev => [...prev, ...(data || [])]);
      setCurrentPage(prev => prev + 1);
      setHasMore((data?.length || 0) === TICKETS_PER_PAGE);
    } catch (error) {
      console.error('Error loading more tickets:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!profile) return;

    refreshTickets();

    // Cleanup previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Realtime subscription - only for NEW tickets (prepend, don't refetch all)
    const channel = supabase
      .channel('all-tickets-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        async (payload) => {
          console.log('New ticket created:', payload);
          // Fetch the full ticket with relations
          const { data } = await supabase
            .from('tickets')
            .select('*, agent_profiles!assigned_agent_id(full_name)')
            .eq('id', payload.new.id)
            .single();
          
          if (data) {
            setTickets(prev => [data, ...prev]);
            setTotalCount(prev => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        async (payload) => {
          console.log('Ticket updated:', payload);
          // Update existing ticket in list
          const { data } = await supabase
            .from('tickets')
            .select('*, agent_profiles!assigned_agent_id(full_name)')
            .eq('id', payload.new.id)
            .single();
          
          if (data) {
            setTickets(prev => prev.map(t => t.id === data.id ? data : t));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tickets' },
        (payload) => {
          console.log('Ticket deleted:', payload);
          setTickets(prev => prev.filter(t => t.id !== payload.old.id));
          setTotalCount(prev => prev - 1);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [profile]);

  const counts = {
    pending: tickets.filter(t => t.status === 'Pending').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
  };

  return (
    <TicketsContext.Provider value={{ 
      tickets, 
      selectedTicketId, 
      setSelectedTicketId, 
      refreshTickets, 
      loadMoreTickets,
      hasMore,
      isLoadingMore,
      counts 
    }}>
      {children}
    </TicketsContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketsContext);
  if (!context) throw new Error('useTickets must be used within TicketsProvider');
  return context;
};