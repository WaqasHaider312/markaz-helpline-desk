import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Ticket } from '@/lib/supabase';
import { ViewType } from '@/pages/Tickets';
import { Search, SlidersHorizontal, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useKeyboardShortcuts } from './KeyboardShortcuts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';

interface TicketListProps {
  currentView: ViewType;
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
  onTicketOpen?: (ticket: Ticket) => void;
  onTicketsLoad?: (tickets: Ticket[]) => void;
}

type SortType = 'newest' | 'oldest' | 'longest-wait';

const getInitials = (name: string) => {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'UN';
};

const TicketList = ({ currentView, selectedTicketId, onSelectTicket, onTicketOpen, onTicketsLoad }: TicketListProps) => {
  const { profile } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('All Topics');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortType>('newest');
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTickets();
    fetchAgents();
  }, [currentView, profile, topicFilter, statusFilter, searchQuery, sortBy]);

  useKeyboardShortcuts({
    onFocusSearch: () => {
      setSearchOpen(true);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  });

  const fetchAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_profiles')
        .select('id, full_name')
        .order('full_name');

      if (error) throw error;
      setAgents(data || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const fetchTickets = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      let query = supabase
        .from('tickets')
        .select('*, agent_profiles!assigned_agent_id(full_name)');

      // Apply view filter
      if (currentView === 'my-open') {
        query = query.eq('assigned_agent_id', profile.id).neq('status', 'Resolved');
      } else if (currentView === 'all-unresolved') {
        query = query.in('status', ['Pending', 'In Progress']).not('assigned_agent_id', 'is', null);
      }  else if (currentView === 'unassigned') {
          query = query.is('assigned_agent_id', null).neq('status', 'Resolved');
        
      } else if (currentView === 'all-assigned') {
        query = query.not('assigned_agent_id', 'is', null).neq('status', 'Resolved');
      } else if (currentView === 'my-resolved-today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.eq('resolved_by', profile.id).eq('status', 'Resolved').gte('updated_at', today.toISOString());
      } else if (currentView === 'all-resolved-today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.eq('status', 'Resolved').gte('updated_at', today.toISOString());
      }

      // Apply topic filter
      if (topicFilter !== 'All Topics') {
        query = query.eq('issue_type', topicFilter);
      }

      // Apply status filter
      if (statusFilter !== 'All') {
        query = query.eq('status', statusFilter);
      }

      // Apply search
      if (searchQuery) {
        query = query.or(
          `ticket_number.ilike.%${searchQuery}%,reseller_phone.ilike.%${searchQuery}%,order_id.ilike.%${searchQuery}%,reseller_name.ilike.%${searchQuery}%`
        );
      }

      // Apply sorting
      if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else if (sortBy === 'longest-wait') {
        // For longest wait, we want oldest pending/in-progress tickets first
        query = query.order('created_at', { ascending: true });
      }

      const { data, error } = await query;

      if (error) throw error;
      setTickets(data || []);
      onTicketsLoad?.(data || []);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

      <select
      onChange={(e) => {
        const count = parseInt(e.target.value);
        if (count === 0) {
          setSelectedTickets(new Set());
        } else if (count === -1) {
          setSelectedTickets(new Set(tickets.map(t => t.id)));
        } else {
          setSelectedTickets(new Set(tickets.slice(0, count).map(t => t.id)));
        }
        e.target.value = '0';
      }}
      className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
    >
      <option value="0">Select Tickets...</option>
      <option value="20">Select 20</option>
      <option value="30">Select 30</option>
      <option value="50">Select 50</option>
      <option value="-1">Select All ({tickets.length})</option>
    </select>

  const handleTicketCheckbox = (ticketId: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedTickets(newSelected);
  };

  const handleBulkAssign = async () => {
    if (!selectedAgent || selectedTickets.size === 0) return;

    setAssigning(true);
    try {
      const updates = Array.from(selectedTickets).map(ticketId => ({
        id: ticketId,
        assigned_agent_id: selectedAgent,
        updated_at: new Date().toISOString()
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('tickets')
          .update({
          assigned_agent_id: selectedAgent === 'unassign' ? null : selectedAgent,
          updated_at: update.updated_at
        })
          .eq('id', update.id);

        if (error) throw error;
      }

      // Clear selection and refresh
      setSelectedTickets(new Set());
      setSelectedAgent('');
      await fetchTickets();
    } catch (error) {
      console.error('Error assigning tickets:', error);
    } finally {
      setAssigning(false);
    }
  };
      const handleBulkResolve = async () => {
        if (selectedTickets.size === 0) return;

        setAssigning(true);
        try {
          for (const ticketId of Array.from(selectedTickets)) {
            const { error } = await supabase
              .from('tickets')
              .update({ 
                status: 'Resolved', 
                resolved_by: profile.id,
                updated_at: new Date().toISOString() 
              })
              .eq('id', ticketId);

            if (error) throw error;
          }

          setSelectedTickets(new Set());
          await fetchTickets();
          toast.success(`${selectedTickets.size} tickets resolved`);
        } catch (error) {
          console.error('Error resolving tickets:', error);
          toast.error('Failed to resolve tickets');
        } finally {
          setAssigning(false);
        }
      };
      
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'status-pending';
      case 'In Progress':
        return 'status-in-progress';
      case 'Resolved':
        return 'status-resolved';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getSortLabel = (sort: SortType) => {
    switch (sort) {
      case 'newest':
        return 'Newest First';
      case 'oldest':
        return 'Oldest First';
      case 'longest-wait':
        return 'Longest Wait';
    }
  };

  return (
    <div className="w-[380px] bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-foreground">Tickets</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search className="h-4 w-4" />
            </Button>
            
            {/* Sort Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setSortBy('newest')}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Newest First</span>
                  {sortBy === 'newest' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('oldest')}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Oldest First</span>
                  {sortBy === 'oldest' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortBy('longest-wait')}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Longest Wait</span>
                  {sortBy === 'longest-wait' && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {searchOpen && (
          <Input
            ref={searchInputRef}
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-3"
          />
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-3">
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
          >
            <option>All Topics</option>
            <option>Delivery Issues</option>
            <option>Payment Issues</option>
            <option>Return Issues</option>
            <option>App/OTP</option>
            <option>Other</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
          >
            <option>All</option>
            <option>Pending</option>
            <option>In Progress</option>
            <option>Resolved</option>
          </select>
        </div>

        {/* Bulk Actions */}
          {tickets.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => {
                    const count = parseInt(e.target.value);
                    if (count === 0) {
                      setSelectedTickets(new Set());
                    } else if (count === -1) {
                      setSelectedTickets(new Set(tickets.map(t => t.id)));
                    } else {
                      setSelectedTickets(new Set(tickets.slice(0, count).map(t => t.id)));
                    }
                    e.target.value = '0';
                  }}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
                >
                  <option value="0">Select Tickets...</option>
                  <option value="0">Deselect All</option>
                  <option value="20">Select 20</option>
                  <option value="30">Select 30</option>
                  <option value="50">Select 50</option>
                  <option value="-1">Select All ({tickets.length})</option>
                </select>
              </div>
            

            {selectedTickets.size > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="..."
                >
                  <option value="">Select Agent</option>
                  <option value="unassign">Unassign Tickets</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.full_name}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleBulkAssign}
                  disabled={!selectedAgent || assigning}
                  className="whitespace-nowrap"
                >
                  {assigning ? 'Assigning...' : 'Assign'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleBulkResolve}
                  disabled={assigning}
                  className="whitespace-nowrap bg-green-600 hover:bg-green-700 text-white"
                >
                  Resolve
                </Button>
              </div>
            )}

            {selectedTickets.size > 0 && (
              <p className="text-xs text-muted-foreground">
                {selectedTickets.size} ticket{selectedTickets.size !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
        )}

        {/* Sort indicator */}
        <p className="text-xs text-muted-foreground mt-2">
          Sorted by: {getSortLabel(sortBy)}
        </p>
      </div>

      {/* Ticket List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-200">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">Loading tickets...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <FileText className="h-12 w-12 text-gray-400 mb-3" />
              <p className="text-foreground font-medium">No tickets found</p>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                  selectedTicketId === ticket.id ? 'bg-blue-50 border-l-4 border-primary' : ''
                }`}
                onClick={() => {
                  onSelectTicket(ticket.id);
                  onTicketOpen?.(ticket);
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedTickets.has(ticket.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleTicketCheckbox(ticket.id);
                  }}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer flex-shrink-0"
                />
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm font-semibold text-primary">{ticket.ticket_number}</span>
                    </div>
                    <span className={`status-badge ${getStatusColor(ticket.status)} flex-shrink-0`}>
                      {ticket.status}
                    </span>
                  </div>

                  <p className="font-medium text-gray-900 mb-1 truncate">{ticket.reseller_name}</p>

                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-4 text-xs text-gray-600">
                      <span>Order: {ticket.order_id}</span>
                    </div>
                    {ticket.assigned_agent_id ? (
                        <div className="h-6 w-6 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0">
                          {getInitials(ticket.agent_profiles?.full_name || 'AG')}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Unassigned</span>
                      )}
                  </div>

                  <p className="text-xs text-gray-500 mb-1 line-clamp-2">
                    {ticket.description}
                  </p>

                  <p className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
    </div>
  );
};

export default TicketList;