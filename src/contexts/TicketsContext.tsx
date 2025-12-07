import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase, Ticket } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface TicketsContextType {
  tickets: Ticket[];
  selectedTicketId: string | null;
  setSelectedTicketId: (id: string | null) => void;
  refreshTickets: () => Promise<void>;
  counts: {
    pending: number;
    inProgress: number;
    resolved: number;
  };
}

const TicketsContext = createContext<TicketsContextType | undefined>(undefined);

export const TicketsProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  const refreshTickets = async () => {
  if (!profile) return;

  try {
    // Load ALL active tickets (Pending + In Progress)
    const { data: activeTickets, error: activeError } = await supabase
      .from('tickets')
      .select('*, agent_profiles!assigned_agent_id(full_name)')
      .in('status', ['Pending', 'In Progress'])
      .order('created_at', { ascending: false });

    if (activeError) throw activeError;

    // Load only first 40 resolved
    const { data: resolvedTickets, error: resolvedError } = await supabase
      .from('tickets')
      .select('*, agent_profiles!assigned_agent_id(full_name)')
      .eq('status', 'Resolved')
      .order('created_at', { ascending: false })
      .limit(40);

    if (resolvedError) throw resolvedError;

    // Combine and sort by created_at
    const allTickets = [...(activeTickets || []), ...(resolvedTickets || [])];
    allTickets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    setTickets(allTickets);
  } catch (error) {
    console.error('Error fetching tickets:', error);
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

    // Realtime subscription - smart updates without full reload
    const channel = supabase
      .channel('all-tickets-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        async (payload) => {
          const { data } = await supabase
            .from('tickets')
            .select('*, agent_profiles!assigned_agent_id(full_name)')
            .eq('id', payload.new.id)
            .single();
          
          if (data) {
            setTickets(prev => [data, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        async (payload) => {
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
          setTickets(prev => prev.filter(t => t.id !== payload.old.id));
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
    <TicketsContext.Provider value={{ tickets, selectedTicketId, setSelectedTicketId, refreshTickets, counts }}>
      {children}
    </TicketsContext.Provider>
  );
};

export const useTickets = () => {
  const context = useContext(TicketsContext);
  if (!context) throw new Error('useTickets must be used within TicketsProvider');
  return context;
};