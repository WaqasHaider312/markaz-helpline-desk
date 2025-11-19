import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Inbox, Clock, CheckCircle, LayoutDashboard, MessageSquare, Settings, LogOut, UserX, Users, ChevronLeft, ChevronRight, Headphones } from 'lucide-react';
import { ViewType } from '@/pages/Tickets';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

interface ViewCounts {
  myOpen: number;
  allUnresolved: number;
  unassigned: number;
  allAssigned: number;
  myResolvedToday: number;
  allResolvedToday: number;
}

const Sidebar = ({ currentView, onViewChange }: SidebarProps) => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [counts, setCounts] = useState<ViewCounts>({
    myOpen: 0,
    allUnresolved: 0,
    unassigned: 0,
    allAssigned: 0,
    myResolvedToday: 0,
    allResolvedToday: 0,
  });

  useEffect(() => {
      fetchCounts();
      
      // Real-time subscription
      const channel = supabase
        .channel('ticket-counts')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
          fetchCounts();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }, [profile]);

  const fetchCounts = async () => {
    if (!profile) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // My Open Tickets (assigned to me, not resolved)
      const { count: myOpen } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_agent_id', profile.id)
        .neq('status', 'Resolved');

      // All Unresolved (everyone's Pending + In Progress)
      const { count: allUnresolved } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['Pending', 'In Progress'])
        .not('assigned_agent_id', 'is', null);

      // Unassigned (no agent assigned)
      const { count: unassigned } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .is('assigned_agent_id', null)
        .neq('status', 'Resolved');

      // All Assigned (assigned to anyone, not resolved)
      const { count: allAssigned } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .not('assigned_agent_id', 'is', null)
        .neq('status', 'Resolved');

      // My Resolved Today
      const { count: myResolvedToday } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('resolved_by', profile.id)
        .eq('status', 'Resolved')
        .gte('updated_at', today.toISOString());

      // All Resolved Today
      const { count: allResolvedToday } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Resolved')
        .gte('updated_at', today.toISOString());

      setCounts({
        myOpen: myOpen || 0,
        allUnresolved: allUnresolved || 0,
        unassigned: unassigned || 0,
        allAssigned: allAssigned || 0,
        myResolvedToday: myResolvedToday || 0,
        allResolvedToday: allResolvedToday || 0,
      });
    } catch (error) {
      console.error('Error fetching counts:', error);
    }
  };

  const views = [
    { id: 'my-open' as ViewType, label: 'My Open Tickets', icon: Inbox, count: counts.myOpen },
    { id: 'all-unresolved' as ViewType, label: 'All Unresolved', icon: Clock, count: counts.allUnresolved },
    { id: 'unassigned' as ViewType, label: 'Unassigned Tickets', icon: UserX, count: counts.unassigned },
    { id: 'all-assigned' as ViewType, label: 'All Assigned', icon: Users, count: counts.allAssigned },
    { id: 'my-resolved-today' as ViewType, label: 'My Resolved Today', icon: CheckCircle, count: counts.myResolvedToday },
    { id: 'all-resolved-today' as ViewType, label: 'All Resolved Today', icon: CheckCircle, count: counts.allResolvedToday },
  ];

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { id: 'canned', label: 'Canned Messages', icon: MessageSquare, path: '/canned-messages' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  ];

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={`bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-60'}`}>
      {/* Logo */}
      <div className="p-4 border-b border-gray-200">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 hover:bg-primary rounded transition-colors group mb-2"
            >
              <ChevronRight className="h-5 w-5 text-gray-600 group-hover:text-white" />
            </button>
            <Headphones className="h-8 w-8 text-primary" />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Headphones className="h-8 w-8 text-primary flex-shrink-0" />
              <span className="text-lg font-bold text-foreground whitespace-nowrap">Markaz Helpline</span>
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 hover:bg-primary rounded transition-colors group flex-shrink-0"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600 group-hover:text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Views Section */}
      <div className="py-4 px-2 flex-1 overflow-hidden">
        {!isCollapsed && (
          <h3 className="text-xs uppercase text-muted-foreground px-3 mb-2 font-medium">
            Views
          </h3>
        )}
        <div className="space-y-1">
          {views.map((view) => {
            const Icon = view.icon;
            const isActive = currentView === view.id;
            
            return (
              <button
                key={view.id}
                onClick={() => onViewChange(view.id)}
                title={isCollapsed ? view.label : ''}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'text-primary font-medium'
                    : 'text-foreground hover:bg-gray-100'
                } ${isCollapsed ? 'justify-center' : ''}`}
              >
                <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col' : ''}`}>
                  <Icon className="h-4 w-4" />
                  {!isCollapsed && <span>{view.label}</span>}
                  {isCollapsed && (
                    <span className="bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {view.count}
                    </span>
                  )}
                </div>
                {!isCollapsed && (
                  <span className="bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">
                    {view.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Section */}
      <div className="py-4 px-2 border-t border-gray-200">
        {!isCollapsed && (
          <h3 className="text-xs uppercase text-muted-foreground px-3 mb-2 font-medium">
            Menu
          </h3>
        )}
        <div className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                title={isCollapsed ? item.label : ''}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-gray-100 transition-colors ${isCollapsed ? 'justify-center' : ''}`}
              >
                <Icon className="h-4 w-4" />
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Profile Section */}
      <div className="mt-auto p-4 border-t border-gray-200">
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url} />
              <AvatarFallback className="bg-primary text-white">
                {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
              </AvatarFallback>
            </Avatar>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="bg-primary text-white">
                  {profile?.full_name ? getInitials(profile.full_name) : 'AG'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {profile?.full_name || 'Agent'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {profile?.email}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut()}
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default Sidebar;