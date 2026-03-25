import { useEffect, useState } from "react";
import type { GitCommitDetail } from "./git-graph.types";
import { useAppStore } from "@/store/app.store";

export function GitGraphCommitDetail({ hash }: { hash: string }) {
  const [detail, setDetail] = useState<GitCommitDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const projectPath = useAppStore((s) => s.projectPath);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);

    void (async () => {
      const result = await window.api?.sourceControl?.getCommitDetail?.({
        hash,
        cwd: projectPath ?? undefined,
      });
      if (cancelled) return;
      setLoading(false);
      if (result?.ok) {
        setDetail(result as GitCommitDetail);
      }
    })();

    return () => { cancelled = true; };
  }, [hash, projectPath]);

  if (loading) {
    return <div className="p-3 text-xs text-muted-foreground">Loading commit details...</div>;
  }
  if (!detail) {
    return null;
  }

  return (
    <div className="border-t border-border/80 p-3">
      <div className="mb-2">
        <p className="text-sm font-medium">{detail.body.split("\n")[0]}</p>
        {detail.body.split("\n").length > 1 ? (
          <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {detail.body.split("\n").slice(1).join("\n").trim()}
          </p>
        ) : null}
      </div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{detail.authorName} &lt;{detail.authorEmail}&gt;</span>
        <span>{new Date(detail.authorDateISO).toLocaleString()}</span>
        <span className="font-mono">{detail.hash.slice(0, 10)}</span>
        {detail.parents.length > 0 ? (
          <span>Parents: {detail.parents.map((p) => p.slice(0, 7)).join(", ")}</span>
        ) : null}
      </div>
      {detail.files.length > 0 ? (
        <div className="max-h-40 space-y-0.5 overflow-auto">
          <p className="text-xs font-medium text-muted-foreground">Changed files ({detail.files.length})</p>
          {detail.files.map((file) => (
            <div key={file.path} className="flex items-center gap-2 text-xs">
              <span className={
                file.status === "A" ? "text-green-500" :
                file.status === "D" ? "text-red-500" :
                file.status === "M" ? "text-yellow-500" :
                "text-muted-foreground"
              }>
                {file.status}
              </span>
              <span className="min-w-0 truncate">{file.path}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
