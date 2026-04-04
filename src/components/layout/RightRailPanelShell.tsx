import type { ReactNode } from "react";
import { PANEL_BAR_HEIGHT_CLASS } from "@/components/layout/panel-bar.constants";
import { RIGHT_RAIL_PANEL_TITLES, type RightRailPanelId } from "@/lib/right-rail-panels";

export function RightRailPanelShell(props: {
  panelId: RightRailPanelId;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
      <header className={`flex shrink-0 items-center border-b border-border/80 px-3 ${PANEL_BAR_HEIGHT_CLASS}`}>
        <h2 className="font-heading text-base font-medium leading-none text-foreground">
          {props.title ?? RIGHT_RAIL_PANEL_TITLES[props.panelId]}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {props.children}
      </div>
    </div>
  );
}
