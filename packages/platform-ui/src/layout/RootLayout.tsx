import React, { useCallback, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Drawer, DrawerTrigger, DrawerContent, DrawerClose, Logo, Separator } from '@agyn/ui';
import { Menu } from 'lucide-react';
import { MainSidebar } from '@agyn/ui-new/components/MainSidebar';
import { useUser } from '../user/user.runtime';

const MENU_ITEM_ROUTES: Record<string, string> = {
  graph: '/agents/graph',
  threads: '/agents/threads',
  reminders: '/agents/reminders',
  containers: '/monitoring/containers',
  resources: '/monitoring/resources',
  secrets: '/settings/secrets',
  variables: '/settings/variables',
};

const DEFAULT_MENU_ITEM = 'graph';
const MENU_ITEM_ENTRIES = Object.entries(MENU_ITEM_ROUTES);

function getMenuItemFromPath(pathname: string) {
  const match = MENU_ITEM_ENTRIES.find(([, route]) => pathname.startsWith(route));
  return match?.[0] ?? DEFAULT_MENU_ITEM;
}

export function RootLayout() {
  const { user } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  const currentUser = {
    name: user?.name ?? 'Guest',
    email: user?.email ?? 'guest@example.com',
    avatar: user?.avatarUrl ?? undefined,
  };

  const selectedMenuItem = getMenuItemFromPath(location.pathname);

  const handleMenuItemSelect = useCallback(
    (itemId: string) => {
      const targetPath = MENU_ITEM_ROUTES[itemId];
      if (!targetPath) return;

      if (location.pathname !== targetPath) {
        navigate(targetPath);
      }
      setIsMobileNavOpen(false);
    },
    [location.pathname, navigate]
  );

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden md:flex md:sticky md:top-0 md:h-screen md:shrink-0 md:z-10">
        <MainSidebar
          currentUser={currentUser}
          selectedMenuItem={selectedMenuItem}
          onMenuItemSelect={handleMenuItemSelect}
        />
      </aside>

      <div className="flex flex-1 min-w-0 flex-col">
        <div className="flex items-center gap-2 border-b px-3 py-4 md:hidden">
          <Drawer open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
            <DrawerTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu className="h-5 w-5" />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="p-0">
              <div className="h-[85vh] overflow-y-auto">
                <MainSidebar
                  currentUser={currentUser}
                  selectedMenuItem={selectedMenuItem}
                  onMenuItemSelect={handleMenuItemSelect}
                />
              </div>
              <div className="p-4">
                <DrawerClose asChild>
                  <Button variant="secondary" className="w-full">
                    Close
                  </Button>
                </DrawerClose>
              </div>
            </DrawerContent>
          </Drawer>
          <Separator orientation="vertical" className="h-6" />
          <Logo size={64} variant="gradient" aria-label="Hautech Agents" />
        </div>

        <main className="relative flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
