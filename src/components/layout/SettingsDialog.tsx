import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-overlay p-4 backdrop-blur-[2px]" onMouseDown={() => onOpenChange({ open: false })}>
      <Card className="animate-dropdown-in flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border-border/80 bg-background shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <CardHeader className="border-b border-border/80 bg-card/50 px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg font-semibold">Settings</CardTitle>
            <Button size="sm" variant="ghost" aria-label="close-settings" onClick={() => onOpenChange({ open: false })}>
              <X className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] gap-0 bg-muted/10 p-0">
          <aside className="min-h-0 overflow-auto border-r border-border/80 bg-sidebar/60 p-3 text-sidebar-foreground">
            <div className="sticky top-0 rounded-xl border border-sidebar-border/70 bg-sidebar/75 p-2 shadow-xs backdrop-blur-sm">
              <div className="flex flex-col gap-3">
                {settingsSectionGroups.map((group) => (
                  <div key={group.label} className="flex flex-col gap-1">
                    <p className="px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/55">
                      {group.label}
                    </p>
                    {group.ids.map((sectionId) => {
                      const section = sectionsById[sectionId];
                      const Icon = section.icon;
                      const active = activeSection === section.id;

                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => setActiveSection(section.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                            active
                              ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                              : "text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          {section.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <main className="min-h-0 overflow-auto px-5 py-4">
            <div className="mx-auto max-w-4xl">
              <SettingsDialogSectionContent
                sectionId={activeSection}
                highlightedProjectPath={activeSection === "projects" ? initialProjectPath : null}
              />
            </div>
          </main>
        </CardContent>
      </Card>
    </div>
  );
}
