import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Ticket } from '@/lib/supabase';
import { ViewType } from '@/pages/Tickets';
import { Search, SlidersHorizontal, FileText, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useKeyboardShortcuts } from './KeyboardShortcuts';
import { useTickets } from '@/contexts/TicketsContext';
import { useMemo } from 'react'; // Add to existing React import
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface TicketListProps {
  currentView: ViewType;
  selectedTicketId: string | null;
  onSelectTicket: (ticketId: string) => void;
  onTicketOpen?: (ticket: Ticket) => void;
  onTicketsLoad?: (tickets: Ticket[]) => void;
}

type SortType = 'newest' | 'oldest' | 'longest-wait' | 'unread';

const getInitials = (name: string) => {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'UN';
};

const TicketList = ({ currentView, selectedTicketId, onSelectTicket, onTicketOpen, onTicketsLoad }: TicketListProps) => {
  const { profile } = useAuth();
  const { tickets: allTickets } = useTickets();
  const [displayedTickets, setDisplayedTickets] = useState<Ticket[]>([]);
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
  const [displayCount, setDisplayCount] = useState(20);
  const [autoLoadCount, setAutoLoadCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [searchResults, setSearchResults] = useState<Ticket[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    fetchAgents();
  }, []);

  const filteredTickets = useMemo(() => {
  if (!profile) return [];

  // Use search results if searching
  if (searchQuery.trim()) {
    return searchResults;
  }

  let filtered = [...allTickets];
  // ... rest of existing code stays the same

  if (searchQuery) {
    filtered = filtered.filter(t => 
      t.ticket_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.reseller_phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.order_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.reseller_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  } else {
    if (currentView === 'my-open') {
      filtered = filtered.filter(t => t.assigned_agent_id === profile.id && t.status !== 'Resolved');
    } else if (currentView === 'all-assigned') {
      filtered = filtered.filter(t => t.status !== 'Resolved' && t.assigned_agent_id !== null);
    } else if (currentView === 'unassigned') {
      filtered = filtered.filter(t => t.assigned_agent_id === null && t.status !== 'Resolved');
    } else if (currentView === 'my-resolved-today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter(t => (t as any).resolved_by === profile.id && t.status === 'Resolved' && new Date(t.updated_at) >= today);
    } else if (currentView === 'all-resolved-today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filtered = filtered.filter(t => t.status === 'Resolved' && new Date(t.updated_at) >= today);
    }
  }

  if (topicFilter !== 'All Topics') {
    filtered = filtered.filter(t => t.issue_type === topicFilter);
  }
  if (statusFilter !== 'All') {
    filtered = filtered.filter(t => t.status === statusFilter);
  }

  const needsReply = filtered.filter(t => !t.latest_message_sender || t.latest_message_sender === 'reseller');
  const alreadyReplied = filtered.filter(t => t.latest_message_sender === 'agent');

  const sortGroup = (tickets: Ticket[]) => {
    if (sortBy === 'unread') {
      return tickets.filter(t => t.unread_by_agent).sort((a, b) => 
        new Date(b.latest_message_at || b.created_at).getTime() - new Date(a.latest_message_at || a.created_at).getTime()
      );
    } else if (sortBy === 'newest') {
      return tickets.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortBy === 'oldest' || sortBy === 'longest-wait') {
      return tickets.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    return tickets;
  };

  return [...sortGroup(needsReply), ...sortGroup(alreadyReplied)];
}, [allTickets, currentView, profile, topicFilter, statusFilter, searchQuery, sortBy, searchResults]);

useEffect(() => {
  setDisplayedTickets(filteredTickets.slice(0, displayCount));
  onTicketsLoad?.(filteredTickets);
  setLoading(false);
}, [filteredTickets, displayCount]);

// Reset display count when view/filters change
  useEffect(() => {
    setDisplayCount(20);
    setAutoLoadCount(0);
  }, [currentView, topicFilter, statusFilter, searchQuery, sortBy]);

  // Scroll detection for auto-load
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const bottomReached = scrollHeight - scrollTop - clientHeight < 100;

      if (bottomReached && displayCount < filteredTickets.length && autoLoadCount < 2) {
        setDisplayCount(prev => prev + 20);
        setAutoLoadCount(prev => prev + 1);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [displayCount, filteredTickets.length, autoLoadCount]);

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


  const searchDatabase = async (query: string) => {
  if (!query.trim()) {
    setSearchResults([]);
    setIsSearching(false);
    return;
  }

  setIsSearching(true);
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*, agent_profiles!assigned_agent_id(full_name)')
      .or(`ticket_number.ilike.%${query}%,reseller_phone.ilike.%${query}%,order_id.ilike.%${query}%,reseller_name.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    setSearchResults(data || []);
  } catch (error) {
    console.error('Error searching:', error);
    setSearchResults([]);
  } finally {
    setIsSearching(false);
  }
};

  const handleTicketCheckbox = (ticketId: string) => {
    const newSelected = new Set(selectedTickets);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedTickets(newSelected);
  };

  const { refreshTickets } = useTickets();

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
        
        const assignedTo = selectedAgent === 'unassign' ? null : agents.find(a => a.id === selectedAgent)?.full_name;
        let activityDetails = '';
        
        if (selectedAgent === 'unassign') {
          activityDetails = `${profile?.full_name} unassigned the ticket`;
        } else if (selectedAgent === profile?.id) {
          activityDetails = `${profile?.full_name} assigned ticket to self`;
        } else {
          activityDetails = `${profile?.full_name} assigned ticket to ${assignedTo}`;
        }
        
        await supabase.from('ticket_activities').insert({
          ticket_id: update.id,
          activity_type: 'assigned',
          actor_name: profile?.full_name || 'Agent',
          details: activityDetails
        });
      }

      setSelectedTickets(new Set());
      setSelectedAgent('');
      await refreshTickets();
      toast.success(`${updates.length} tickets assigned`);
    } catch (error) {
      console.error('Error assigning tickets:', error);
      toast.error('Failed to assign tickets');
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
            resolved_by: profile?.id,
            updated_at: new Date().toISOString() 
          })
          .eq('id', ticketId);

        if (error) throw error;

        await supabase.from('ticket_activities').insert({
          ticket_id: ticketId,
          activity_type: 'status_changed',
          actor_name: profile?.full_name || 'Agent',
          details: `${profile?.full_name} marked ticket as Resolved`
        });
      }

      setSelectedTickets(new Set());
      await refreshTickets();
      toast.success(`${selectedTickets.size} tickets resolved`);
    } catch (error) {
      console.error('Error resolving tickets:', error);
      toast.error('Failed to resolve tickets');
    } finally {
      setAssigning(false);
    }
  };

  const handleLoadMore = () => {
    setDisplayCount(prev => prev + 20);
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
      case 'unread':
        return 'Unread Messages';
    }
  };

  const hasMore = displayCount < filteredTickets.length;

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
                <DropdownMenuItem
                  onClick={() => setSortBy('unread')}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>Unread Messages</span>
                  {sortBy === 'unread' && <Check className="h-4 w-4" />}
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
            onChange={(e) => {
              setSearchQuery(e.target.value);
              
              // Clear previous timeout
              if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
              }
              
              // Debounce search by 500ms
              searchTimeoutRef.current = setTimeout(() => {
                searchDatabase(e.target.value);
              }, 500);
            }}
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
        {filteredTickets.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => {
                  const count = parseInt(e.target.value);
                  if (count === 0) {
                    setSelectedTickets(new Set());
                  } else if (count === -1) {
                    setSelectedTickets(new Set(filteredTickets.map(t => t.id)));
                  } else {
                    setSelectedTickets(new Set(filteredTickets.slice(0, count).map(t => t.id)));
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
                <option value="-1">Select All ({filteredTickets.length})</option>
              </select>
            </div>

            {selectedTickets.size > 0 && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedAgent}
                  onChange={(e) => setSelectedAgent(e.target.value)}
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:border-primary focus:border-primary focus:ring-2 focus:ring-blue-100 outline-none"
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

        {/* Sort indicator + Count */}
        <div className="flex justify-between items-center mt-2">
          <p className="text-xs text-muted-foreground">
            Sorted by: {getSortLabel(sortBy)}
          </p>
          <p className="text-xs text-muted-foreground">
            Showing {displayedTickets.length} of {filteredTickets.length}
          </p>
        </div>
      </div>

      {/* Ticket List */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto divide-y divide-gray-200">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Loading tickets...</p>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <FileText className="h-12 w-12 text-gray-400 mb-3" />
            <p className="text-foreground font-medium">No tickets found</p>
            <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {displayedTickets.map((ticket) => (
              <div
                key={ticket.id}
                className={`flex items-start gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                  selectedTicketId === ticket.id ? 'bg-blue-50 border-l-4 border-primary' : ''
                } ${((ticket.latest_message_sender === 'reseller' || !ticket.latest_message_sender) && ticket.status !== 'Resolved') ? 'bg-blue-50' : ''}`}
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
                        {((ticket.latest_message_sender === 'reseller' || !ticket.latest_message_sender) && ticket.status !== 'Resolved') && (
                          <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0"></span>
                        )}
                        <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className={`text-sm text-primary ${((ticket.latest_message_sender === 'reseller' || !ticket.latest_message_sender) && ticket.status !== 'Resolved') ? 'font-bold' : 'font-semibold'}`}>
                          {ticket.ticket_number}
                        </span>
                      </div>
                    <span className={`status-badge ${getStatusColor(ticket.status)} flex-shrink-0`}>
                      {ticket.status}
                    </span>
                  </div>

                  <p className={`text-gray-900 mb-1 truncate ${((ticket.latest_message_sender === 'reseller' || !ticket.latest_message_sender) && ticket.status !== 'Resolved') ? 'font-bold' : 'font-medium'}`}>
                    {ticket.reseller_name}
                  </p>

                  <div className="flex items-center justify-between mb-2">
                    <div className="flex gap-4 text-xs text-gray-600">
                      <span>Order: {ticket.order_id}</span>
                    </div>
                    {ticket.assigned_agent_id ? (
                      <div className="h-6 w-6 rounded-full bg-primary text-white text-xs flex items-center justify-center flex-shrink-0">
                        {getInitials((ticket as any).agent_profiles?.full_name || 'AG')}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Unassigned</span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mb-1 line-clamp-2">
                    {ticket.latest_message || ticket.description}
                  </p>

                  <p className="text-xs text-gray-400">
                    {ticket.latest_message_at 
                      ? formatDistanceToNow(new Date(ticket.latest_message_at), { addSuffix: true })
                      : formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })
                    }
                  </p>
                </div>
              </div>
            ))}

            {/* Load More Button */}
            {hasMore && autoLoadCount >= 2 && (
              <div className="p-4 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  className="text-sm text-primary hover:underline"
                >
                  Load 20 More
                </button>
              </div>
            )}

            {/* Auto-loading indicator */}
            {hasMore && autoLoadCount < 2 && (
              <div className="p-4 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TicketList;