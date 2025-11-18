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
  onNextTicket?: () => void;
}

interface AgentProfile {
  id: string;
  full_name: string;
}

const InfoPanel = ({ ticketId, onNextTicket }: InfoPanelProps) => {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [updating, setUpdating] = useState(false);
  const [isEditingIssueType, setIsEditingIssueType] = useState(false);
  const [newIssueType, setNewIssueType] = useState('');

  useEffect(() => {
    if (ticketId) {
      fetchTicket();
      fetchAgents();
    }
  }, [ticketId]);

    const handleIssueTypeChange = async () => {
    if (!ticketId || !newIssueType) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from('tickets')
        .update({ issue_type: newIssueType })
        .eq('id', ticketId);

      if (error) throw error;

      toast.success('Issue type updated');
      setIsEditingIssueType(false);
      const updated = await fetchTicket();
      if (updated) {
        setTicket(updated);
      }
    } catch (error) {
      console.error('Error updating issue type:', error);
      toast.error('Failed to update issue type');
    } finally {
      setUpdating(false);
    }
  };

  const fetchTicket = async () => {
    if (!ticketId) return;

    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      if (error) throw error;
      setTicket(data);
      return data;
    } catch (error) {
      console.error('Error fetching ticket:', error);
      return null;
    }
  };

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
      fetchTicket(); // Refresh
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    } finally {
      setUpdating(false);
    }
        if (newStatus === 'Resolved') {
      toast.success('Ticket resolved');
      setTimeout(() => {
        onNextTicket?.();
      }, 500);
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

      toast.success('Assignment updated');
      fetchTicket(); // Refresh
    } catch (error) {
      console.error('Error updating assignment:', error);
      toast.error('Failed to update assignment');
    } finally {
      setUpdating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  if (!ticketId || !ticket) {
    return (
      <div className="w-[320px] bg-white border-l border-gray-200 flex items-center justify-center p-4">
        <p className="text-sm text-gray-500">Select a ticket to view details</p>
      </div>
    );
  }

  return (
    <div className="w-[320px] bg-white border-l border-gray-200 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="font-semibold text-lg text-foreground">Ticket Info</h3>
      </div>

      {/* Status & Assignment */}
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">
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
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">
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
{/* Quick Actions */}
      <div className="p-4">
        <h4 className="text-xs font-medium text-gray-600 mb-3">Quick Actions</h4>
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start text-sm"
            onClick={() => {
              const url = `${window.location.origin}/tickets`;
              copyToClipboard(url);
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy Link
          </Button>
          
          {ticket.status !== 'Resolved' && (
            <Button
              className="w-full justify-start text-sm bg-green-600 hover:bg-green-700 text-white"
              onClick={() => handleStatusChange('Resolved')}
              disabled={updating}
            >
              ✓ Mark Resolved
            </Button>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-medium text-gray-600 mb-2">Contact</h4>
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

      {/* Details */}
      <div className="p-4 border-b border-gray-200">
        <h4 className="text-xs font-medium text-gray-600 mb-3">Details</h4>
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-1">Ticket #</p>
            <p className="text-foreground font-medium">{ticket.ticket_number}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Order ID</p>
            <p className="text-foreground">{ticket.order_id}</p>
          </div>

          <div>
              <p className="text-xs text-gray-500 mb-1">Issue Type</p>
              {isEditingIssueType ? (
                <div className="space-y-2">
                  <select
                    value={newIssueType}
                    onChange={(e) => setNewIssueType(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="">Select Type</option>
                    <option value="Delivery Issues">Delivery Issues</option>
                    <option value="Payment Issues">Payment Issues</option>
                    <option value="Return Issues">Return Issues</option>
                    <option value="App/OTP">App/OTP</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={handleIssueTypeChange} disabled={updating || !newIssueType}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setIsEditingIssueType(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-foreground">{ticket.issue_type}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsEditingIssueType(true);
                      setNewIssueType(ticket.issue_type);
                    }}
                    className="text-xs"
                  >
                    Edit
                  </Button>
                </div>
              )}
            </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Created</p>
            <p className="text-foreground">
              {format(new Date(ticket.created_at), 'MMM dd, yyyy HH:mm')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPanel;