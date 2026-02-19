import type { ReactElement } from "react";

const HomePage = (): ReactElement => {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <header className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">Billing Card</h2>
        <p className="m-0 text-sm text-muted-foreground">Pricing details and actions for upgrade flow testing.</p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
            data-testid="upgrade-button"
            type="button"
          >
            Upgrade
          </button>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/90"
            data-testid="cancel-button"
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </section>
  );
};

const SettingsPage = (): ReactElement => {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
      <header className="flex flex-col gap-2">
        <h2 className="m-0 text-lg font-semibold">Profile Settings</h2>
        <p className="m-0 text-sm text-muted-foreground">Second route for multi-page smoke testing and pin placement checks.</p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 rounded-md border border-border p-3">
          <div className="text-sm font-semibold">Notifications</div>
          <p className="m-0 text-sm text-muted-foreground">Email me when team usage exceeds limits.</p>
        </div>
        <div>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            data-testid="save-settings-button"
            type="button"
          >
            Save settings
          </button>
        </div>
      </div>
    </section>
  );
};

export const App = (): ReactElement => {
  const pathname = window.location.pathname;
  const isSettingsRoute = pathname === "/settings";

  const navLinkClassName =
    "inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground";

  return (
    <main className="pinpatch-ui-theme min-h-screen bg-background text-foreground" data-theme="light">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-8">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 text-3xl font-bold tracking-tight">
            Pinpatch Smoke Test App</h1>
          <p className="m-0 text-sm text-muted-foreground">
            Use this page with <code>pinpatch dev --target 3000</code> for end-to-end smoke checks.
          </p>
        </header>

        <nav className="flex items-center gap-2">
          <a className={`${navLinkClassName} ${!isSettingsRoute ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : ""}`} href="/">
            Home
          </a>
          <a
            className={`${navLinkClassName} ${isSettingsRoute ? "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : ""}`}
            data-testid="settings-route-link"
            href="/settings"
          >
            Settings
          </a>
        </nav>

        {isSettingsRoute ? <SettingsPage /> : <HomePage />}
      </div>
    </main>
  );
};
