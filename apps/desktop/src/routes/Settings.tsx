import { useEffect, useState } from "react";
import { useThemeStore } from "../stores/theme";
import { Moon, Sun, Monitor } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@githelm/ui";
import { PageHeader } from "../components/domain/PageHeader";
import { api } from "../lib/api";

export const SettingsPage = () => {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getAppVersion()
      .then((v) => {
        if (!cancelled) setVersion(`${v.tauri} · renderer v${v.version}`);
      })
      .catch(() => {
        if (!cancelled) setVersion("browser preview");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader title="Settings" description="Application preferences." />

      <div className="space-y-6 p-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider th-text-muted">
            Appearance
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>
                Choose how Githelm looks. System follows your OS preference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <ThemeOption
                  active={theme === "light"}
                  onClick={() => setTheme("light")}
                  icon={Sun}
                  label="Light"
                />
                <ThemeOption
                  active={theme === "dark"}
                  onClick={() => setTheme("dark")}
                  icon={Moon}
                  label="Dark"
                />
                <ThemeOption
                  active={theme === "system"}
                  onClick={() => setTheme("system")}
                  icon={Monitor}
                  label="System"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider th-text-muted">
            About
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Githelm</CardTitle>
              <CardDescription>
                A Tauri 2 + React 19 desktop client for self-hosted deployment.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Runtime" value={version ?? "loading…"} />
              <Row label="License" value="Apache-2.0" />
              <Row
                label="Inspired by"
                value={
                  <a
                    href="https://github.com/oblien/openship"
                    target="_blank"
                    rel="noreferrer"
                    className="th-link"
                  >
                    openship
                  </a>
                }
              />
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider th-text-muted">
            Data
          </h2>
          <Card>
            <CardHeader>
              <CardTitle>Reset preferences</CardTitle>
              <CardDescription>
                Clears the saved theme + recent state. Server connections are
                stored separately in the OS keychain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
              >
                Clear local storage
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
};

const ThemeOption = ({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={
      active
        ? "flex w-32 items-center gap-2 rounded-md border th-bd-default bg-[var(--th-sf-06)] px-3 py-2 text-sm font-medium th-text-title"
        : "flex w-32 items-center gap-2 rounded-md border th-bd-subtle px-3 py-2 text-sm th-text-body hover:bg-[var(--th-sf-04)]"
    }
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const Row = ({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) => (
  <div className="flex items-center justify-between border-t th-bd-subtle pt-2 first:border-t-0 first:pt-0">
    <span className="th-text-muted">{label}</span>
    <span className="font-medium th-text-title">{value}</span>
  </div>
);