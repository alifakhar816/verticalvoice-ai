import { redirect } from "next/navigation";
import { createClient } from "@/lib/database/supabase-server";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { AppSidebar } from "@/components/shared/app-sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A signed-in user with no tenant hasn't finished setup. Every dashboard page
  // needs a tenant to show anything, so send them to onboarding rather than a
  // shell full of empty states. Onboarding lives at /onboarding, outside this
  // layout, so there is no redirect loop.
  const tenantId = await getCurrentTenantId(user.id);
  if (!tenantId) {
    redirect("/onboarding");
  }

  const userInfo = {
    email: user.email ?? "",
    name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? undefined,
  };

  return (
    <SidebarProvider>
      <AppSidebar user={userInfo} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
