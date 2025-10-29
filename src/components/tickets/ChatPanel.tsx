import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, Ticket, Message, InternalNote } from '@/lib/supabase';
import { MessageCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface ChatPanelProps {
  ticketId: string | null;
  onToggleInfo: () => void;
}

const ChatPanel = ({ ticketId, onToggleInfo }: ChatPanelProps) => {
  const { profile } = useAuth();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [internalNotes, setInternalNotes] = useState<InternalNote[]>([]);
  const [activeTab, setActiveTab] = useState<'reply' | 'note'>('reply');
  const [replyText, setReplyText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ticketId) {
      fetchTicketData();
    }
  }, [ticketId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, internalNotes]);

  const fetchTicketData = async () => {
    if (!ticketId) return;

    try {
      const { data: ticketData } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', ticketId)
        .single();

      const { data: messagesData } = await supabase
        .from('messages')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      const { data: notesData } = await supabase
        .from('internal_notes')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      setTicket(ticketData);
      setMessages(messagesData || []);
      setInternalNotes(notesData || []);
    } catch (error) {
      console.error('Error fetching ticket data:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !ticketId || !profile) return;

    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        ticket_id: ticketId,
        sender_type: 'agent',
        sender_name: profile.full_name,
        message: replyText.trim(),
      });

      if (error) throw error;

      // Auto-update status to In Progress if Pending
      if (ticket?.status === 'Pending') {
        await supabase
          .from('tickets')
          .update({ status: 'In Progress' })
          .eq('id', ticketId);
      }

      setReplyText('');
      toast.success('Message sent');
      fetchTicketData();
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !ticketId || !profile) return;

    setSending(true);
    try {
      const { error } = await supabase.from('internal_notes').insert({
        ticket_id: ticketId,
        agent_id: profile.id,
        agent_name: profile.full_name,
        note_text: noteText.trim(),
      });

      if (error) throw error;

      setNoteText('');
      toast.success('Note added');
      fetchTicketData();
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    } finally {
      setSending(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!ticketId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white">
        <MessageCircle className="h-16 w-16 text-gray-400 mb-4" />
        <p className="text-lg text-gray-600">Select a ticket to view conversation</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Top Bar */}
      <div className="sticky top-0 p-4 border-b border-gray-200 bg-white z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-foreground">{ticket?.ticket_number}</h2>
            <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">
              {ticket?.issue_type}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={onToggleInfo}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Initial Ticket */}
        {ticket && (
          <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded">
            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded mb-2 inline-block">
              New Support Request
            </span>
            <div className="grid gap-2 text-sm">
              <div>
                <span className="font-medium">Order ID:</span> {ticket.order_id}
              </div>
              <div>
                <span className="font-medium">Issue Type:</span> {ticket.issue_type}
              </div>
              <div className="mt-2 text-gray-700">{ticket.description}</div>
              <div className="text-xs text-gray-500 mt-2 text-right">
                {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>
        )}

        {/* Messages and Notes */}
        {messages.map((message) =>
          message.sender_type === 'reseller' ? (
            <div key={message.id} className="flex justify-start">
              <div className="flex items-start gap-2 max-w-[70%]">
                <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center text-xs font-medium">
                  {getInitials(message.sender_name)}
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-sm p-3">
                  <p className="text-xs text-gray-600 mb-1">{message.sender_name}</p>
                  <p className="text-sm text-gray-900 whitespace-pre-wrap">{message.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div key={message.id} className="flex justify-end">
              <div className="flex items-start gap-2 max-w-[70%]">
                <div className="bg-primary rounded-2xl rounded-tr-sm p-3">
                  <p className="text-xs text-blue-100 mb-1">{message.sender_name}</p>
                  <p className="text-sm text-white whitespace-pre-wrap">{message.message}</p>
                  <p className="text-xs text-blue-100 mt-1">
                    {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                  </p>
                </div>
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-white">
                  {getInitials(message.sender_name)}
                </div>
              </div>
            </div>
          )
        )}

        {/* Internal Notes */}
        {internalNotes.map((note) => (
          <div key={note.id} className="internal-note">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🔒</span>
              <span className="bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded">
                Internal Note
              </span>
              <span className="text-sm font-medium">{note.agent_name}</span>
            </div>
            <p className="text-gray-700 italic">{note.note_text}</p>
            <p className="text-xs text-gray-500 mt-2">
              {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
            </p>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Section */}
      <div className="sticky bottom-0 border-t border-gray-200 bg-white">
        {/* Tabs */}
        <div className="flex px-4 pt-2 gap-4 border-b">
          <button
            onClick={() => setActiveTab('reply')}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === 'reply'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-primary'
            }`}
          >
            Reply
          </button>
          <button
            onClick={() => setActiveTab('note')}
            className={`pb-2 text-sm font-medium transition-colors ${
              activeTab === 'note'
                ? 'border-b-2 border-yellow-500 text-yellow-600'
                : 'text-gray-600 hover:text-yellow-600'
            }`}
          >
            Internal Note
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === 'reply' ? (
            <>
              <Textarea
                placeholder="Type your message..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                className="mb-2 resize-none"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  {replyText.length}/500
                </span>
                <Button
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sending}
                >
                  {sending ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Textarea
                placeholder="Add an internal note (only visible to agents)..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                className="mb-2 bg-yellow-50 border-yellow-300 resize-none"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  🔒 This note is only visible to your team
                </span>
                <Button
                  onClick={handleAddNote}
                  disabled={!noteText.trim() || sending}
                  className="bg-yellow-500 hover:bg-yellow-600"
                >
                  {sending ? 'Adding...' : 'Add Note'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
