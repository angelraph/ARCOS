import { RunClient } from "./RunClient";

export default function RunPage() {
  return (
    <main className="flex-1 px-6 py-12" style={{ "--gradient-angle": "60deg" } as React.CSSProperties}>
      <RunClient />
    </main>
  );
}
