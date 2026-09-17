import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  ClipboardList,
  ClipboardCheck,
  Clock3,
  Factory,
  FileText,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  ShoppingBag,
  Scissors,
  Truck,
  Wallet,
  Receipt,
  WashingMachine,
  BadgeCheck,
  Boxes,
  BarChart3,
  Cog,
  ShieldAlert,
  Users,
  UserRoundCog,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: ShoppingBag, label: "Orders", path: "/orders" },
  { icon: Factory, label: "Production", path: "/production" },
  { icon: Users, label: "Customers", path: "/customers" },
  { icon: ClipboardList, label: "Daily reports", path: "/reports" },
  { icon: Clock3, label: "Attendance", path: "/attendance" },
  { icon: Scissors, label: "Cutting", path: "/cutting" },
  { icon: Factory, label: "Sewing control", path: "/sewing" },
  { icon: WashingMachine, label: "DTF printing", path: "/printing" },
  { icon: BadgeCheck, label: "Quality control", path: "/qc" },
  { icon: Boxes, label: "Packing", path: "/packing" },
  { icon: Truck, label: "Delivery", path: "/delivery" },
  { icon: Users, label: "Employees", path: "/employees" },
  { icon: Cog, label: "Machines", path: "/machines" },
  { icon: BarChart3, label: "Management reports", path: "/management-reports" },
  { icon: ShieldAlert, label: "Factory alerts", path: "/alerts" },
  { icon: Wallet, label: "Payments", path: "/payments", finance: true },
  { icon: Receipt, label: "Expenses", path: "/expenses", finance: true },
  { icon: BarChart3, label: "Finance reports", path: "/finance-reports", finance: true },
];

const SIDEBAR_WIDTH_KEY = "thread-studio-sidebar-width";
const DEFAULT_WIDTH = 264;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-[0_20px_80px_rgba(26,55,74,0.12)] border border-[#e7eef1]">
          <div className="mb-8 flex items-center gap-3">
            <div className="brand-mark">TS</div>
            <div>
              <p className="text-lg font-semibold tracking-tight text-[#163247]">THREAD STUDIO</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#7c919d]">Factory operating system</p>
            </div>
          </div>
          <div className="mb-8">
            <p className="eyebrow mb-3">Mirpur · Dhaka</p>
            <h1 className="font-display text-3xl leading-tight text-[#163247]">Keep the floor moving.</h1>
            <p className="mt-3 text-sm leading-6 text-[#71818b]">Sign in to manage orders, production progress, and daily factory reports in one place.</p>
          </div>
          <Button onClick={() => startLogin()} className="h-12 w-full rounded-xl bg-[#ef6c4d] text-white hover:bg-[#df5c3d]">Sign in to workspace</Button>
          <p className="mt-4 text-center text-xs text-[#98a6ad]">Access is controlled by your factory role.</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent user={user} setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({ children, user, setSidebarWidth }: { children: React.ReactNode; user: NonNullable<ReturnType<typeof useAuth>["user"]>; setSidebarWidth: (width: number) => void }) {
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const { logout } = useAuth();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const active = menuItems.find(item => item.path === location) ?? menuItems[0];
  const canManageUsers = user.role === "owner" || user.role === "admin";
  const canViewFinance = user.role === "owner" || user.role === "manager" || user.role === "admin";

  useEffect(() => {
    if (!isResizing) return;
    const move = (event: MouseEvent) => setSidebarWidth(Math.max(220, Math.min(340, event.clientX - (sidebarRef.current?.getBoundingClientRect().left ?? 0))));
    const up = () => setIsResizing(false);
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div ref={sidebarRef} className="relative">
        <Sidebar collapsible="icon" className="border-r border-[#e3ecef] bg-[#f7fafb]" disableTransition={isResizing}>
          <SidebarHeader className="h-[78px] justify-center border-b border-[#e3ecef]">
            <div className="flex w-full items-center gap-3 px-2">
              <button onClick={toggleSidebar} className="brand-mark shrink-0" aria-label="Toggle navigation">TS</button>
              {!isCollapsed && <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-[#163247]">THREAD STUDIO</p><p className="truncate text-[10px] uppercase tracking-[0.16em] text-[#8b9ba3]">Factory OS</p></div>}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-2 py-4">
            <p className="eyebrow mb-2 px-3 group-data-[collapsible=icon]:hidden">Workspace</p>
            <SidebarMenu>
              {menuItems.filter(item => !item.finance || canViewFinance).map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl text-sm font-medium"><item.icon className="h-[18px] w-[18px]" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
              {canManageUsers && <SidebarMenuItem><SidebarMenuButton isActive={location === "/users"} onClick={() => setLocation("/users")} tooltip="Team access" className="h-11 rounded-xl text-sm font-medium"><UserRoundCog className="h-[18px] w-[18px]" /><span>Team access</span></SidebarMenuButton></SidebarMenuItem>}
            </SidebarMenu>
            {!isCollapsed && <div className="mt-7 rounded-2xl bg-[#e9f2f1] p-4"><div className="mb-2 flex items-center gap-2 text-[#1d665e]"><FileText className="h-4 w-4" /><span className="text-xs font-semibold">Management layer</span></div><p className="text-xs leading-5 text-[#5a7776]">Employees, machines, reports, and internal alerts.</p></div>}
          </SidebarContent>
          <SidebarFooter className="border-t border-[#e3ecef] p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white"><Avatar className="h-9 w-9 bg-[#d9e9e6] text-[#1d665e]"><AvatarFallback>{(user.name || "U").slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold text-[#163247]">{user.name || "Workspace user"}</p><p className="truncate text-xs capitalize text-[#85969f]">{user.role === "factory_staff" ? "Factory staff" : user.role}</p></div></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-red-600"><LogOut className="mr-2 h-4 w-4" /> Sign out</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div onMouseDown={() => !isCollapsed && setIsResizing(true)} className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize hover:bg-[#ef6c4d]/30 ${isCollapsed ? "hidden" : ""}`} />
      </div>
      <SidebarInset className="bg-[var(--canvas)]">
        {isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[#e3ecef] bg-[var(--canvas)]/95 px-4 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg" /><div><p className="text-sm font-semibold text-[#163247]">{active.label}</p><p className="text-[10px] uppercase tracking-[0.14em] text-[#91a0a7]">THREAD STUDIO</p></div></div>}
        <main className="min-h-screen p-4 pb-16 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
