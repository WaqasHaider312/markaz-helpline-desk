import { MessageCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowLeft, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CannedMessage {
  id: string;
  agent_id: string;
  title: string;
  message_text: string;
  created_at: string;
}

const CannedMessages = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [messages, setMessages] = useState<CannedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingMessage, setEditingMessage] = useState<CannedMessage | null>(null);
  const [title, setTitle] = useState('');
  const [messageText, setMessageText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMessages();
  }, [profile]);

  const fetchMessages = async () => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('canned_messages')
        .select('*')
        .eq('agent_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingMessage(null);
    setTitle('');
    setMessageText('');
    setShowDialog(true);
  };

  const handleEdit = (message: CannedMessage) => {
    setEditingMessage(message);
    setTitle(message.title);
    setMessageText(message.message_text);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!title.trim() || !messageText.trim() || !profile) {
      toast.error('Please fill all fields');
      return;
    }

    setSaving(true);
    try {
      if (editingMessage) {
        // Update existing
        const { error } = await supabase
          .from('canned_messages')
          .update({
            title: title.trim(),
            message_text: messageText.trim(),
          })
          .eq('id', editingMessage.id);

        if (error) throw error;
        toast.success('Message updated');
      } else {
        // Create new
        const { error } = await supabase
          .from('canned_messages')
          .insert({
            agent_id: profile.id,
            title: title.trim(),
            message_text: messageText.trim(),
          });

        if (error) throw error;
        toast.success('Message created');
      }

      setShowDialog(false);
      fetchMessages();
    } catch (error) {
      console.error('Error saving message:', error);
      toast.error('Failed to save message');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this canned message?')) return;

    try {
      const { error } = await supabase
        .from('canned_messages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Message deleted');
      fetchMessages();
    } catch (error) {
      console.error('Error deleting message:', error);
      toast.error('Failed to delete message');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b p-4 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/tickets')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Canned Messages</h1>
            <p className="text-sm text-muted-foreground">Quick replies for common responses</p>
          </div>
          <Button onClick={handleAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Message
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <MessageCircle className="h-16 w-16 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No canned messages yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create quick replies to save time</p>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Message
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 max-w-4xl mx-auto">
            {messages.map((message) => (
              <div
                key={message.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-foreground">{message.title}</h3>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(message)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(message.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.message_text}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Created {new Date(message.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingMessage ? 'Edit Canned Message' : 'Add Canned Message'}
            </DialogTitle>
            <DialogDescription>
              Create a quick reply that you can use in ticket responses
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Title</label>
              <Input
                placeholder="e.g., Welcome Message, Refund Policy"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Message</label>
              <Textarea
                placeholder="Type your canned message here..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={8}
                className="resize-none"
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {messageText.length}/1000 characters
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CannedMessages;