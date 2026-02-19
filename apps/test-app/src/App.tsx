import type { ReactElement } from "react";
import { Button } from "@pinpatch/ui/components/button";

const cardClassName = "space-y-4 rounded-lg border border-slate-200 bg-white p-3";

const HomePage = (): ReactElement => {
  return (
    <div className={cardClassName}>
      <h2 className="text-lg font-semibold">Billing Card</h2>
      <p className="text-sm text-slate-600">Pricing details and actions for upgrade flow testing.</p>
      <div className="flex items-center gap-4">
        <Button data-testid="upgrade-button" className="px-6 py-3 text-base">
          Upgrade
        </Button>
        <Button variant="secondary" data-testid="cancel-button">
          Cancel
        </Button>
      </div>
    </div>
  );
};

const SettingsPage = (): ReactElement => {
  return (
    <div className={cardClassName}>
      <h2 className="text-lg font-semibold">Profile Settings</h2>
      <p className="text-sm text-slate-600">Second route for multi-page smoke testing and pin placement checks.</p>
      <div className="space-y-2">
        <div className="rounded-md border border-slate-200 p-3">
          <div className="text-sm font-medium">Notifications</div>
          <div className="text-xs text-slate-600">Email me when team usage exceeds limits.</div>
        </div>
        <Button data-testid="save-settings-button">Save settings</Button>
      </div>
    </div>
  );
};

export const App = (): ReactElement => {
  const pathname = window.location.pathname;
  const isSettingsRoute = pathname === "/settings";

  return (
    <main className="mx-auto max-w-3xl p-8 text-slate-900">
      <h1 className="mb-3 text-3xl font-bold">Pinpatch Smoke Test App</h1>
      <p className="mb-6 text-slate-600">Use this page with `pinpatch dev --target 3000` for end-to-end smoke checks.</p>
      <div className="mb-6 flex items-center gap-2 text-sm">
        <a
          href="/"
          className={`rounded border px-3 py-1 ${!isSettingsRoute ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
        >
          Home
        </a>
        <a
          href="/settings"
          className={`rounded border px-3 py-1 ${isSettingsRoute ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}
          data-testid="settings-route-link"
        >
          Settings
        </a>
      </div>

      {isSettingsRoute ? <SettingsPage /> : <HomePage />}
    </main>
  );
};
