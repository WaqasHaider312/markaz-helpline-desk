import { useEffect, useState } from 'react';
import { supabase, Ticket } from '@/lib/supabase';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface InfoPanelProps {
  ticketId: string | null;
}

interface AgentProfile {
  id: string;
  full_name: string;
}

const InfoPanel = ({ ticketId }: InfoPanelProps) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
      fetchAgents();
    }
  }, [ticketId]);

  const fetchTicket = async () => {
    if (!ticketId) return;

    try {
      const { data } = await supabase
        .from('tickets')
        .select(`
          *,
          agent_profiles!tickets_assigned_agent_id_fkey (full_name)
        `)
        .eq('id', ticketId)
        .single();

      setTicket(data);
    } catch (error) {
      console.error('Error fetching ticket:', error);
    }
  };

  const fetchAgents = async () => {
    try {
      const { data } = await supabase
        .from('agent_profiles')
        .select('id, full_name')
        .order('full_name');

      setAgents(data || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!ticketId) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ status: newStatus })
        .eq('id', ticketId);

      if (error) throw error;

      setTicket(prev => prev ? { ...prev, status: newStatus } : null);
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignChange = async (agentId: string) => {
    if (!ticketId) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ assigned_agent_id: agentId === 'unassigned' ? null : agentId })
        .eq('id', ticketId);

      if (error) throw error;

      await fetchTicket(); // Refresh to get agent name
      toast.success('Assignment updated');
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Failed to update assignment');
    } finally {
      setUpdating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'bg-amber-100 text-amber-800';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800';
      case 'Resolved':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getAssignedAgentName = () => {
    if (ticket?.agent_profiles) {
      return (ticket.agent_profiles as any).full_name;
    }
    return 'Unassigned';
  };

  if (!ticketId || !ticket) {
    return null;
  }

  return (
    <div className="w-[320px] bg-white border-l border-gray-200 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h3 className="font-semibold text-lg text-foreground">Ticket Info</h3>
      </div>

      {/* Status & Assignment Section */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Status
          </label>
          <Select
            value={ticket.status}
            onValueChange={handleStatusChange}
            disabled={updating}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Pending
                </span>
              </SelectItem>
              <SelectItem value="In Progress">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  In Progress
                </span>
              </SelectItem>
              <SelectItem value="Resolved">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Resolved
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Assign to
          </label>
          <Select
            value={ticket.assigned_agent_id || 'unassigned'}
            onValueChange={handleAssignChange}
            disabled={updating}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Contact Card */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Contact</h4>
        <p className="text-base font-semibold text-foreground mb-2">{ticket.reseller_name}</p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{ticket.reseller_phone}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copyToClipboard(ticket.reseller_phone)}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Ticket Details */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Details</h4>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Ticket #</p>
            <p className="text-foreground font-mono font-medium">{ticket.ticket_number}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Order ID</p>
            <p className="text-foreground font-medium">{ticket.order_id}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Issue Type</p>
            <p className="text-foreground">{ticket.issue_type}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Created</p>
            <p className="text-foreground">
              {format(new Date(ticket.created_at), 'MMM dd, yyyy HH:mm')}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
            <p className="text-foreground">
              {format(new Date(ticket.updated_at), 'MMM dd, yyyy HH:mm')}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="p-4">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Quick Actions</h4>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start text-sm"
            onClick={() => {
              const url = `${window.location.origin}/tickets?ticket=${ticket.id}`;
              copyToClipboard(url);
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Ticket Link
          </Button>
          
          {ticket.status !== 'Resolved' && (
            <Button
              className="w-full justify-start text-sm bg-green-600 hover:bg-green-700"
              onClick={() => handleStatusChange('Resolved')}
              disabled={updating}
            >
              ✓ Mark as Resolved
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InfoPanel;
