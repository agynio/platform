import { useState, type ReactNode } from 'react';
import { 
  ChevronRight,
  User
} from 'lucide-react';

export interface MenuItem {
  id: string;
  label: string;
  icon: ReactNode;
  items?: SubMenuItem[];
}

export interface SubMenuItem {
  id: string;
  label: string;
  icon: ReactNode;
}

interface SidebarProps {
  menuItems: MenuItem[];
  currentUser?: {
    name: string;
    email: string;
    avatar?: string;
  };
  selectedMenuItem?: string;
  onMenuItemSelect?: (itemId: string) => void;
}

export default function Sidebar({ 
  menuItems,
  currentUser = { name: 'John Doe', email: 'john@agyn.io' },
  selectedMenuItem = 'graph',
  onMenuItemSelect
}: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set(['agents']));

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleItemClick = (itemId: string) => {
    if (onMenuItemSelect) {
      onMenuItemSelect(itemId);
    }
  };

  return (
    <div className="w-64 h-full bg-white border-r border-[var(--agyn-border-subtle)] flex flex-col">
      {/* Logo */}
      <div className="h-[66px] px-6 flex items-center border-b border-[var(--agyn-border-subtle)]">
        <svg 
          width="128" 
          height="42" 
          viewBox="0 0 128 42" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          className="w-auto h-8 pt-1"
        >
          <defs>
            <linearGradient id="sidebar-logo-gradient" x1="0" y1="0" x2="128" y2="42" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>
          <path d="M108.664 12.9649V30.1996H100.343V0.388169H108.273V5.64787H108.625C109.289 3.91405 110.402 2.54251 111.965 1.53327C113.527 0.51109 115.422 0 117.648 0C119.732 0 121.548 0.452864 123.098 1.35859C124.647 2.26432 125.852 3.55822 126.711 5.24029C127.57 6.90942 128 8.90203 128 11.2181V30.1996H119.68V12.6932C119.693 10.8688 119.224 9.44547 118.273 8.42329C117.323 7.38817 116.014 6.87061 114.347 6.87061C113.228 6.87061 112.238 7.10998 111.379 7.58872C110.532 8.06747 109.868 8.76617 109.386 9.68484C108.918 10.5906 108.677 11.6839 108.664 12.9649Z" fill="url(#sidebar-logo-gradient)" />
          <path d="M73.2531 41.379C72.1984 41.379 71.2088 41.2949 70.2843 41.1267C69.3728 40.9714 68.6176 40.7708 68.0186 40.525L69.8936 34.3531C70.8702 34.6507 71.7491 34.8124 72.5304 34.8383C73.3247 34.8642 74.0083 34.683 74.5812 34.2949C75.1672 33.9067 75.6424 33.2468 76.007 32.3152L76.4953 31.0536L65.7334 0.388208H74.4836L80.6946 22.281H81.0071L87.2767 0.388208H96.0854L84.4251 33.4215C83.8652 35.0259 83.1035 36.4233 82.1399 37.6137C81.1894 38.817 79.9849 39.7422 78.5266 40.3891C77.0682 41.049 75.3104 41.379 73.2531 41.379Z" fill="url(#sidebar-logo-gradient)" />
          <path d="M46.8269 42C44.1315 42 41.8203 41.6312 39.8932 40.8937C37.9791 40.1691 36.4556 39.1793 35.3228 37.9242C34.19 36.6691 33.4543 35.2588 33.1157 33.6932L40.8112 32.6645C41.0455 33.2597 41.4166 33.8161 41.9245 34.3336C42.4323 34.8512 43.1029 35.2653 43.9362 35.5758C44.7826 35.8993 45.8112 36.061 47.0222 36.061C48.8321 36.061 50.323 35.6211 51.4949 34.7412C52.6798 33.8743 53.2723 32.4187 53.2723 30.3743V24.9205H52.9207C52.5561 25.7486 52.0093 26.5314 51.2801 27.2689C50.5509 28.0065 49.6134 28.6081 48.4675 29.0739C47.3217 29.5397 45.9545 29.7726 44.3659 29.7726C42.1133 29.7726 40.0625 29.2551 38.2135 28.22C36.3775 27.1719 34.9126 25.5739 33.8189 23.4261C32.7381 21.2653 32.1978 18.5351 32.1978 15.2357C32.1978 11.8586 32.7511 9.03789 33.8579 6.77356C34.9647 4.50924 36.4361 2.81423 38.2721 1.68854C40.1211 0.562847 42.1458 0 44.3464 0C46.0261 0 47.4324 0.284658 48.5652 0.853974C49.698 1.41035 50.6095 2.10906 51.2996 2.95009C52.0027 3.77819 52.5431 4.59334 52.9207 5.39556H53.2332V0.388169H61.4951V30.4908C61.4951 33.0268 60.8701 35.1488 59.62 36.8567C58.37 38.5647 56.6382 39.8457 54.4247 40.6996C52.2241 41.5665 49.6915 42 46.8269 42ZM47.0027 23.5619C48.3438 23.5619 49.4767 23.232 50.4012 22.5721C51.3387 21.8993 52.0548 20.9418 52.5496 19.6996C53.0574 18.4445 53.3114 16.9436 53.3114 15.1969C53.3114 13.4501 53.064 11.9362 52.5692 10.6553C52.0744 9.36137 51.3582 8.35859 50.4207 7.64695C49.4832 6.9353 48.3438 6.57948 47.0027 6.57948C45.6355 6.57948 44.4831 6.94824 43.5456 7.68577C42.6081 8.41035 41.8984 9.41959 41.4166 10.7135C40.9349 12.0074 40.694 13.5018 40.694 15.1969C40.694 16.9177 40.9349 18.4057 41.4166 19.6608C41.9114 20.903 42.6211 21.8669 43.5456 22.5527C44.4831 23.2255 45.6355 23.5619 47.0027 23.5619Z" fill="url(#sidebar-logo-gradient)" />
          <path d="M9.96109 30.7625C8.047 30.7625 6.34124 30.4325 4.84382 29.7726C3.34641 29.0998 2.16149 28.11 1.28908 26.8031C0.429694 25.4834 0 23.8401 0 21.8734C0 20.2172 0.305994 18.8262 0.917983 17.7006C1.52997 16.5749 2.36332 15.6691 3.41802 14.9834C4.47272 14.2976 5.67066 13.78 7.01183 13.4307C8.36601 13.0813 9.78531 12.8355 11.2697 12.6932C13.0145 12.512 14.4208 12.3438 15.4885 12.1885C16.5562 12.0203 17.331 11.7745 17.8128 11.451C18.2945 11.1275 18.5354 10.6488 18.5354 10.0148V9.89833C18.5354 8.66913 18.1448 7.71811 17.3635 7.04528C16.5953 6.37246 15.5015 6.03604 14.0822 6.03604C12.5848 6.03604 11.3934 6.36599 10.508 7.02588C9.62254 7.67283 9.0366 8.48798 8.75013 9.47135L1.0547 8.85028C1.44533 7.03882 2.21358 5.4732 3.35943 4.15342C4.50528 2.8207 5.98316 1.79852 7.79309 1.08687C9.61603 0.362291 11.7254 0 14.1213 0C15.788 0 17.3831 0.194084 18.9065 0.582253C20.443 0.970424 21.8037 1.57209 22.9886 2.38724C24.1866 3.2024 25.1306 4.25046 25.8207 5.53142C26.5108 6.79945 26.8559 8.31977 26.8559 10.0924V30.1996H18.9651V26.0656H18.7308C18.249 26.9972 17.6044 27.8189 16.7971 28.5305C15.9898 29.2292 15.0198 29.7791 13.8869 30.1802C12.7541 30.5684 11.4455 30.7625 9.96109 30.7625ZM12.3439 25.0564C13.5679 25.0564 14.6487 24.817 15.5862 24.3383C16.5237 23.8466 17.2594 23.1867 17.7932 22.3586C18.3271 21.5305 18.594 20.5924 18.594 19.5444V16.3808C18.3336 16.549 17.9755 16.7043 17.5198 16.8466C17.0771 16.976 16.5758 17.0989 16.0159 17.2153C15.456 17.3189 14.8961 17.4159 14.3362 17.5065C13.7763 17.5841 13.2684 17.6553 12.8127 17.72C11.8361 17.8623 10.9832 18.0887 10.2541 18.3993C9.52488 18.7098 8.95847 19.1303 8.55482 19.6608C8.15117 20.1784 7.94934 20.8253 7.94934 21.6017C7.94934 22.7274 8.3595 23.5878 9.17983 24.183C10.0132 24.7652 11.0679 25.0564 12.3439 25.0564Z" fill="url(#sidebar-logo-gradient)" />
        </svg>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {menuItems.map((item) => {
            const isExpanded = expandedItems.has(item.id);
            
            return (
              <div key={item.id}>
                {/* Top Level Item */}
                <button
                  onClick={() => toggleExpand(item.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[var(--agyn-dark)] hover:bg-[var(--agyn-bg-light)] transition-colors"
                >
                  <span className="text-[var(--agyn-gray)]">{item.icon}</span>
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRight 
                    className={`w-4 h-4 text-[var(--agyn-gray)] transition-transform duration-200 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                </button>

                {/* Subitems */}
                {isExpanded && item.items && (
                  <div className="ml-6 mt-1 space-y-1 animate-in slide-in-from-top-2 fade-in duration-200">
                    {item.items.map((subItem) => {
                      const isActive = selectedMenuItem === subItem.id;
                      
                      return (
                        <button
                          key={subItem.id}
                          onClick={() => handleItemClick(subItem.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-[6px] transition-colors ${
                            isActive
                              ? 'bg-[var(--agyn-bg-accent)] text-[var(--agyn-blue)]'
                              : 'text-[var(--agyn-gray)] hover:bg-[var(--agyn-bg-light)] hover:text-[var(--agyn-dark)]'
                          }`}
                        >
                          <span className={isActive ? 'text-[var(--agyn-blue)]' : 'text-[var(--agyn-gray)]'}>
                            {subItem.icon}
                          </span>
                          <span className="text-left">{subItem.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-[var(--agyn-border-subtle)]">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-10 h-10 rounded-full bg-[var(--agyn-blue)] flex items-center justify-center text-white">
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full rounded-full" />
            ) : (
              <User className="w-5 h-5" />
            )}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm truncate text-[var(--agyn-dark)]">{currentUser.name}</p>
            <p className="text-xs text-[var(--agyn-gray)] truncate">{currentUser.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
