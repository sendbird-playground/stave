import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { SettingsDialogSectionContent, settingsSectionGroups, settingsSections, type SectionId } from "./settings-dialog-sections";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (args: { open: boolean }) => void;
  initialSection?: SectionId;
  initialProjectPath?: string | null;
}

const sectionsById = Object.fromEntries(settingsSections.map((section) => [section.id, section])) as Record<SectionId, (typeof settingsSections)[number]>;

export function SettingsDialog(args: SettingsDialogProps) {
  const { initialProjectPath, initialSection, open, onOpenChange } = args;
  const [activeSection, setActiveSection] = useState<SectionId>("general");

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveSection(initialSection ?? "general");
  }, [initialSection, open]);

  if (!open) {
    return null;
  }

  const activeSectionData = sectionsById[activeSection];

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]"
      onMouseDown={() => onOpenChange({ open: false })}
    >
      <Card
        className="animate-dropdown-in flex h-[92vh] w-full max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border-border/80 bg-background py-0 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <SidebarProvider
          className="h-full min-h-0 flex-1 items-start overflow-hidden"
          style={{ "--sidebar-width": "220px", height: "100%", minHeight: 0 } as React.CSSProperties}
        >
          <Sidebar collapsible="none" className="border-r border-border/80 bg-sidebar/60">
            <SidebarContent className="pt-2">
              {settingsSectionGroups.map((group) => (
                <SidebarGroup key={group.label}>
                  <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/55">
                    {group.label}
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.ids.map((sectionId) => {
                        const section = sectionsById[sectionId];
                        const Icon = section.icon;
                        const active = activeSection === section.id;

                        return (
                          <SidebarMenuItem key={section.id}>
                            <SidebarMenuButton
                              onClick={() => setActiveSection(section.id)}
                              className={cn(
                                active
                                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary hover:text-sidebar-primary-foreground"
                                  : "text-sidebar-foreground/78",
                              )}
                            >
                              <Icon />
                              <span>{section.label}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </Sidebar>

          <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/80 bg-card/50 px-4">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <span className="text-sm text-muted-foreground">Settings</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-sm font-medium">
                      {activeSectionData.label}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              <div className="ml-auto">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="close-settings"
                  onClick={() => onOpenChange({ open: false })}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <div className="mx-auto max-w-4xl">
                <SettingsDialogSectionContent
                  sectionId={activeSection}
                  highlightedProjectPath={activeSection === "projects" ? initialProjectPath : null}
                />
              </div>
            </div>
          </main>
        </SidebarProvider>
      </Card>
    </div>
  );
}
